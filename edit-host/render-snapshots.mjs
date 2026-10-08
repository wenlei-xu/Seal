import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicJson, failure, sourcePath } from './project-store.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Called inside the source transaction. Copy blobs, never hard-link them: the
// renderer may create caches, and must not be able to change the source checkpoint.
export async function prepareRenderSnapshot(store, editId, { state, before }, options) {
  const exportId = `export_${crypto.randomUUID().replaceAll('-', '')}`;
  const directory = path.join(store.editDir(editId), 'exports', exportId);
  const projectDir = path.join(directory, 'project');
  const files = Object.fromEntries(Object.entries(before).sort(([a], [b]) => a.localeCompare(b)));
  if (!files['index.html']) throw failure('master_missing', 'Export requires a master composition');
  const input = { schemaVersion: 1, exportId, editId, projectId: state.projectId,
    revision: state.revision, files, runtime: { hyperframes: '0.8.130', node: process.versions.node }, options };
  const manifest = { ...input, inputHash: hash(JSON.stringify(input)), createdAt: new Date().toISOString() };
  for (const [file, digest] of Object.entries(files)) {
    const bytes = await fs.readFile(path.join(store.root, 'blobs', digest));
    if (hash(bytes) !== digest) throw failure('checkpoint_changed', 'Export checkpoint bytes do not match their hash', 409);
    const target = sourcePath(projectDir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
  }
  await atomicJson(path.join(directory, 'input.json'), manifest);
  return { directory, projectDir, manifest };
}
