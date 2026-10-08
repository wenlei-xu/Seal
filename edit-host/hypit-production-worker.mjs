import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { assertPlainTree, sourcePath } from './project-store.mjs';
import { hashFile } from './hypit-inputs.mjs';

let child;
let cancelled = false;
function notify(message, callback) { if (process.connected) process.send(message, callback); else callback?.(); }
process.on('message', message => { if (message?.type === 'cancel') { cancelled = true; child?.kill(); } });
process.once('disconnect', () => { cancelled = true; child?.kill(); });
async function cli(distribution, project, args, progress = false) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    child = spawn(process.execPath, [distribution.cli, ...args, '--workspace', project, '--json'], { cwd: project, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const active = child;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; active.kill(); }, args[0] === 'build' ? 650_000 : 30_000);
    child.stdout.on('data', bytes => { stdout += bytes; if (stdout.length > 2 * 1024 * 1024) child.kill(); });
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-8192); if (progress) notify({ type: 'progress', text: stderr.slice(-2000) }); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (cancelled) return reject(new Error('Production cancelled'));
      if (timedOut) return reject(new Error('Hypit command timed out'));
      if (code !== 0) {
        let detail;
        try { const report = JSON.parse(stdout); detail = report.error?.message || report.error?.detail || report.message; } catch {}
        return reject(new Error(detail || stderr.slice(-4000) || stdout.slice(-4000) || `Hypit exited with code ${code}`));
      }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Hypit returned an invalid machine result')); }
    });
  });
}

async function exportBundle(distribution, project, buildId, outputs, inputs) {
  const require = createRequire(path.join(distribution.root, 'package.json'));
  const { register } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
  const unregister = register();
  try {
    const { installDistributionPackageResolution } = await import(pathToFileURL(path.join(distribution.root, 'packages/package-loader-node/src/distribution-resolution.ts')).href);
    installDistributionPackageResolution([distribution.root]);
    const { FileBuildResultRepository } = await import(pathToFileURL(path.join(distribution.root, 'packages/build-result/src/index.ts')).href);
    const { compileHyperframesDocument } = await import(pathToFileURL(path.join(distribution.root, 'packages/hyperframes/src/index.ts')).href);
    // Hypit may retain an input as an external-file reference. Accept only
    // unchanged frozen project inputs, never arbitrary host files or URLs.
    const approved = new Map(inputs.map(item => [path.resolve(sourcePath(project, item.file)), item.sha256]));
    async function external(uri) {
      const file = fileURLToPath(uri);
      const expected = approved.get(path.resolve(file));
      if (!expected) throw new Error('Result refers to a file outside frozen production inputs');
      await assertPlainTree(path.dirname(file));
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || await hashFile(file) !== expected) throw new Error('Frozen production input changed');
      return { file, size: info.size };
    }
    const repo = new FileBuildResultRepository(path.join(project, '.hypit/results'), {
      size: async uri => (await external(uri)).size,
      open: async (uri, range) => createReadStream((await external(uri)).file, range ? { start: range.start, end: range.endExclusive - 1 } : {}),
    });
    if ((await repo.read(buildId))?.outcome !== 'complete') throw new Error('Hypit Build Result is not complete');
    const files = [], resources = [], seen = new Map(), contentArtifacts = new Map();
    async function value(name, expectedType) {
      const output = await repo.resolve(buildId, name);
      if (!output || `${output.type.module.name}@${output.type.module.version}/${output.type.name}` !== expectedType || output.value.kind !== 'value') throw new Error(`Output ${name} must be ${expectedType}`);
      const data = structuredClone(output.value.document.value);
      for (const binding of output.value.document.resources) {
        if (!['build-file', 'external-file'].includes(binding.file.kind)) throw new Error('Unsupported production result resource');
        const identity = binding.file.kind === 'external-file' ? binding.file.uri : `${binding.file.build || output.build}:${binding.file.path}`;
        let artifact = seen.get(identity);
        if (!artifact) {
          const chunks = []; let size = 0;
          const stream = await repo.openFile(output.build, binding.file);
          if (!stream) throw new Error('Production result resource is missing');
          for await (const bytes of stream) { size += bytes.length; if (size > 32 * 1024 * 1024) throw new Error('Candidate resource exceeds 32 MB'); chunks.push(Buffer.from(bytes)); }
          if (size !== binding.file.size) throw new Error('Production result resource size changed');
          const content = Buffer.concat(chunks);
          const sha256 = crypto.createHash('sha256').update(content).digest('hex');
          artifact = contentArtifacts.get(sha256);
          if (artifact && artifact.mediaType !== binding.file.mediaType) throw new Error('Identical result bytes have conflicting media types');
          if (!artifact) {
            artifact = { kind: 'blob', resource: `res_beeftv:${sha256}`, size, mediaType: binding.file.mediaType };
            const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
              'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg',
              'font/ttf': '.ttf', 'font/otf': '.otf', 'font/woff': '.woff', 'font/woff2': '.woff2' }[artifact.mediaType] || '.bin';
            const relative = `assets/${sha256}${extension}`;
            files.push({ path: relative, base64: content.toString('base64'), sha256 }); resources.push({ resource: artifact.resource, path: relative }); contentArtifacts.set(sha256, artifact);
          }
          seen.set(identity, artifact);
        }
        let owner = data;
        if (!binding.at.length) throw new Error('Invalid result resource binding');
        for (const key of binding.at.slice(0, -1)) {
          if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe result binding');
          owner = owner[key]; if (!owner || typeof owner !== 'object') throw new Error('Invalid result resource path');
        }
        const key = binding.at.at(-1);
        if (['__proto__', 'prototype', 'constructor'].includes(key) || owner[key] !== null) throw new Error('Invalid result resource slot');
        owner[key] = artifact;
      }
      return data;
    }
    const composition = await value(outputs.composition, '@hypit/composition@1/Composition');
    const timeline = await value(outputs.timeline, '@hypit/timeline@1/Timeline');
    const document = compileHyperframesDocument(composition, { id: timeline.id, durationSec: timeline.durationSec, frameRate: timeline.frameRate });
    const audioTracks = composition.tracks.filter(track => track.kind === 'audio');
    const selected = new Set(document.artifacts.map(item => item.artifact.resource));
    for (const track of audioTracks) for (const clip of track.clips) selected.add(clip.artifact.resource);
    const bindings = resources.filter(item => selected.has(item.resource));
    const paths = new Set(bindings.map(item => item.path));
    return { document, audioTracks, resources: bindings, files: files.filter(item => paths.has(item.path)) };
  } finally { unregister(); }
}

process.once('message', async message => {
  if (message?.type !== 'start') return;
  const { distribution, project, command, source, outputs, inputs } = message;
  let result;
  try {
    const args = [command, source, ...(command === 'check' ? [] : ['--runtime', path.join(project, 'hypit.runtime.json')]), ...(command === 'build' ? ['--follow', '--max-wait-ms', '600000'] : [])];
    const report = await cli(distribution, project, args, true);
    if (command === 'build') {
      if (report.build?.result?.state !== 'complete' || report.build?.work?.outcome !== 'complete') throw new Error('Hypit did not finish production successfully');
      const bundle = await exportBundle(distribution, project, report.build.id, outputs, inputs);
      const content = JSON.stringify(bundle);
      await fs.writeFile(path.join(path.dirname(project), 'bundle.json'), content, { flag: 'wx' });
      report.bundleHash = crypto.createHash('sha256').update(content).digest('hex');
    }
    result = { type: 'done', report };
  } catch (error) { result = { type: 'failed', error: error.message, cancelled }; }
  finally {
    if (command === 'build') {
      const wasCancelled = cancelled; cancelled = false;
      try { await cli(distribution, project, ['runtime', 'down', '--runtime', path.join(project, 'hypit.runtime.json')]); }
      catch (error) { result = { type: 'failed', error: `Runtime cleanup failed: ${error.message}`, cancelled: wasCancelled }; }
      cancelled = wasCancelled;
    }
    notify(result, () => process.exit(result.type === 'done' ? 0 : 1));
  }
});
