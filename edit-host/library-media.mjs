import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseHTML } from 'linkedom';
import { failure, safeId, atomicProjectSource } from './project-store.mjs';
import { ensureHfIds } from './hyperframes.mjs';

const formats = new Map([
  ['image/png', ['image', '.png']], ['image/jpeg', ['image', '.jpg']],
  ['image/webp', ['image', '.webp']], ['image/gif', ['image', '.gif']],
  ['video/mp4', ['video', '.mp4']], ['video/webm', ['video', '.webm']],
  ['audio/wav', ['audio', '.wav']], ['audio/x-wav', ['audio', '.wav']],
  ['audio/mpeg', ['audio', '.mp3']], ['audio/ogg', ['audio', '.ogg']],
  ['audio/mp4', ['audio', '.m4a']],
]);

export function createLibraryMedia(store, gateway) {
  async function importMedia(editId, input, stream) {
    safeId(input.operationId);
    // IDs are provenance, never paths. Only MIME-selected extensions enter paths.
    if (typeof input.assetId !== 'string' || !input.assetId || input.assetId.length > 80
      || typeof input.resourceId !== 'string' || !input.resourceId || input.resourceId.length > 80) {
      throw failure('invalid_asset', 'A saved asset and resource are required');
    }
    const format = formats.get(input.mimeType);
    if (!format || format[0] !== input.kind) throw failure('unsupported_media', 'This saved media format is not supported');
    if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > 512 * 1024 * 1024) {
      throw failure('media_size_invalid', 'Saved media must be between 1 byte and 512 MB', 413);
    }
    const duration = input.kind === 'image' ? 5 : input.durationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) throw failure('duration_missing', 'Video and audio require a saved duration');
    if (input.kind !== 'audio' && (!Number.isSafeInteger(input.width) || input.width <= 0
      || !Number.isSafeInteger(input.height) || input.height <= 0)) throw failure('dimensions_missing', 'Visual media requires saved dimensions');
    const staging = path.join(store.editDir(editId), 'incoming');
    await fs.mkdir(staging, { recursive: true });
    const temporary = path.join(staging, crypto.randomUUID());
    const digest = crypto.createHash('sha256');
    let size = 0;
    try {
      await pipeline(stream, new Transform({ transform(bytes, _encoding, done) {
        size += bytes.length;
        if (size > input.size) return done(failure('media_size_mismatch', 'Media exceeds saved size'));
        digest.update(bytes); done(null, bytes);
      } }), createWriteStream(temporary, { flags: 'wx' }));
      if (size !== input.size) throw failure('media_size_mismatch', 'Media does not match saved size');
      const sha256 = digest.digest('hex');
      const owned = await gateway.open(editId);
      return await store.transaction(editId, { operationId: input.operationId, expectedRevision: input.expectedRevision,
        requestKey: crypto.createHash('sha256').update(JSON.stringify(input)).update(sha256).digest('hex') }, async dir => {
        const entry = path.join(dir, 'index.html');
        const { document } = parseHTML(await fs.readFile(entry, 'utf8'));
        const root = document.querySelector('[data-composition-id]');
        if (!root) throw failure('master_missing', 'Project has no master composition');
        const clips = [...root.children].filter(node => node.classList.contains('clip'));
        const start = Math.max(0, ...clips.map(node => Number(node.getAttribute('data-start') || 0) + Number(node.getAttribute('data-duration') || 0)));
        if (!Number.isFinite(start)) throw failure('invalid_timeline', 'Existing clips have invalid timing');
        const relative = `assets/library/${sha256}${format[1]}`;
        const target = path.join(dir, relative);
        const clipId = `asset_${crypto.createHash('sha256').update(input.operationId).digest('hex').slice(0, 24)}`;
        const window = await owned.history.beginWindow({ kind: 'person', name: 'You' }, '从资产库加入素材');
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          try {
            const existing = await fs.readFile(target);
            if (crypto.createHash('sha256').update(existing).digest('hex') !== sha256) throw failure('asset_copy_changed', 'Saved project media was modified', 409);
          } catch (error) { if (error.code !== 'ENOENT') throw error; await fs.copyFile(temporary, target); }
          const node = document.createElement(input.kind === 'image' ? 'img' : input.kind);
          for (const [key, value] of Object.entries({ id: clipId, class: 'clip', src: relative,
            'data-start': start, 'data-duration': duration, 'data-track-index': input.kind === 'audio' ? 20 : 0,
            'data-beeftv-asset-id': input.assetId, 'data-beeftv-resource-id': input.resourceId,
            'data-beeftv-resource-sha256': sha256, 'data-label': String(input.title || '素材').slice(0, 240),
            ...(input.kind === 'image' ? { alt: String(input.title || '') } : { 'data-media-start': 0 }) })) node.setAttribute(key, String(value));
          if (input.kind !== 'audio') node.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain');
          if (clips.length === 0 && input.kind !== 'audio') {
            root.setAttribute('data-width', String(input.width)); root.setAttribute('data-height', String(input.height));
          }
          root.appendChild(node);
          root.setAttribute('data-duration', String(Math.max(Number(root.getAttribute('data-duration') || 0), start + duration)));
          await atomicProjectSource(store, editId, 'index.html', ensureHfIds(document.toString()));
          return { clipId, assetId: input.assetId, resourceId: input.resourceId, file: relative, sha256, start, duration };
        } finally { await window.close(); }
      });
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return { importMedia };
}
