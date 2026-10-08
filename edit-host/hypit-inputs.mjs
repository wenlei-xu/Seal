import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicJson, assertPlainTree, failure, safeId, sourcePath } from './project-store.mjs';

const run = promisify(execFile);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const formats = new Map([
  ['image/png', ['image', '.png']], ['image/jpeg', ['image', '.jpg']], ['image/webp', ['image', '.webp']], ['image/gif', ['image', '.gif']],
  ['video/mp4', ['video', '.mp4']], ['video/webm', ['video', '.webm']],
  ['audio/wav', ['audio', '.wav']], ['audio/x-wav', ['audio', '.wav']], ['audio/mpeg', ['audio', '.mp3']], ['audio/ogg', ['audio', '.ogg']], ['audio/mp4', ['audio', '.m4a']],
]);

export async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

// Only the trusted Go resource service supplies bytes and media metadata.
// Agent arguments contain asset IDs; they never contain URLs or host paths.
export function createHypitInputs(store, workspace) {
  const records = editId => path.join(store.editDir(editId), 'hypit', 'inputs');
  async function get(editId, inputId) {
    const record = JSON.parse(await fs.readFile(path.join(records(editId), `${safeId(inputId)}.json`), 'utf8'));
    await assertPlainTree(workspace(editId));
    const file = sourcePath(workspace(editId), record.file);
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== record.size || await hashFile(file) !== record.sha256) {
      throw failure('input_changed', 'Saved production input changed', 409);
    }
    return { record, file };
  }
  async function list(editId) {
    const names = await fs.readdir(records(editId)).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    return Promise.all(names.filter(name => /^input_[a-f0-9]+\.json$/.test(name)).map(async name => JSON.parse(await fs.readFile(path.join(records(editId), name), 'utf8'))));
  }
  async function importMedia(editId, input, stream) {
    safeId(input.operationId);
    const format = formats.get(input.mimeType);
    if (!format || format[0] !== input.kind || !input.assetId || !input.resourceId) throw failure('invalid_input', 'Choose a saved image, video or audio resource');
    if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > 512 * 1024 * 1024) throw failure('media_size_invalid', 'Saved input exceeds the media limit', 413);
    if (input.kind !== 'image' && (!Number.isFinite(input.durationMs) || input.durationMs <= 0)) throw failure('duration_missing', 'Saved input requires a duration');
    const incoming = path.join(store.editDir(editId), 'incoming');
    await fs.mkdir(incoming, { recursive: true });
    const temporary = path.join(incoming, crypto.randomUUID());
    const hash = crypto.createHash('sha256'); let size = 0;
    try {
      await pipeline(stream, new Transform({ transform(bytes, _encoding, done) {
        size += bytes.length;
        if (size > input.size) return done(failure('media_size_mismatch', 'Input exceeds saved resource size'));
        hash.update(bytes); done(null, bytes);
      } }), createWriteStream(temporary, { flags: 'wx' }));
      if (size !== input.size) throw failure('media_size_mismatch', 'Input does not match saved resource size');
      const sha256 = hash.digest('hex');
      return await store.locked(editId, async () => {
        const inputId = `input_${digest(input.operationId).slice(0, 32)}`;
        const manifest = path.join(records(editId), `${inputId}.json`);
        const requestKey = digest(JSON.stringify(input) + sha256);
        try {
          const previous = JSON.parse(await fs.readFile(manifest, 'utf8'));
          if (previous.requestKey !== requestKey) throw failure('operation_reused', 'Input import operation was reused', 409);
          await get(editId, inputId); return { ...previous, replayed: true };
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if ((await store.state(editId)).revision !== input.expectedRevision) throw failure('revision_conflict', 'The edit changed before input import', 409);
        await assertPlainTree(workspace(editId));
        const file = `assets/${sha256}${format[1]}`;
        const target = sourcePath(workspace(editId), file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        try { await fs.copyFile(temporary, target, fs.constants.COPYFILE_EXCL); }
        catch (error) { if (error.code !== 'EEXIST') throw error; if (await hashFile(target) !== sha256) throw failure('input_changed', 'Saved input was modified', 409); }
        const record = { inputId, requestKey, assetId: input.assetId, resourceId: input.resourceId, title: String(input.title || '素材').slice(0, 240),
          kind: input.kind, mimeType: input.mimeType, size, durationMs: input.durationMs, width: input.width, height: input.height, file, sha256 };
        await atomicJson(manifest, record); return record;
      });
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function frames(editId, input) {
    const { record, file } = await get(editId, input.inputId);
    if (record.kind === 'audio') throw failure('visual_input_required', 'Choose an image or reference video');
    const times = record.kind === 'image' ? [0] : input.times;
    if (!Array.isArray(times) || !times.length || times.length > 8 || times.some(time => !Number.isFinite(time) || time < 0 || (record.kind === 'video' && time * 1000 >= record.durationMs))) {
      throw failure('invalid_frame_times', 'Choose one to eight times within the reference duration');
    }
    const frames = [];
    for (const time of times) {
      const { stdout } = await run(process.env.PRODUCER_FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
        ...(record.kind === 'video' ? ['-ss', String(time)] : []), '-i', file, '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 512 * 1024, timeout: 30_000, windowsHide: true });
      if (!stdout.length) throw failure('frame_unavailable', 'Reference frame could not be decoded');
      frames.push({ time, mimeType: 'image/jpeg', data: stdout.toString('base64') });
    }
    return { inputId: record.inputId, title: record.title, durationMs: record.durationMs, frames };
  }
  return { importMedia, list, frames };
}
