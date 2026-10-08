import fs from 'node:fs/promises';
import path from 'node:path';
import { failure, safeId } from './project-store.mjs';

export async function savedExport(store, editId, exportId) {
  safeId(exportId);
  const directory = path.join(store.editDir(editId), 'exports', exportId);
  const input = JSON.parse(await fs.readFile(path.join(directory, 'input.json'), 'utf8'));
  if (input.editId !== editId || input.exportId !== exportId) throw failure('export_scope_mismatch', 'Export belongs to another edit', 403);
  let status;
  try { status = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; status = { status: 'preparing', progress: 0 }; }
  if (status.exportId && status.exportId !== exportId) throw failure('export_scope_mismatch', 'Invalid export status', 409);
  const file = path.join(directory, 'output.mp4');
  return { file, summary: { exportId, inputRevision: input.revision, createdAt: input.createdAt,
    status: status.status, progress: status.progress, ...(status.error ? { error: status.error } : {}), format: input.options.format || 'mp4' } };
}

export async function listSavedExports(store, editId) {
  const root = path.join(store.editDir(editId), 'exports');
  let names;
  try { names = await fs.readdir(root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const name of names.filter(name => /^export_[a-zA-Z0-9_]+$/.test(name))) {
    try { result.push((await savedExport(store, editId, name)).summary); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function nativeExportFile(store, editId, fileName) {
  if (typeof fileName !== 'string' || !fileName || fileName !== path.basename(fileName) || /[\\/:\0]/.test(fileName)) throw failure('invalid_export_file', 'Invalid render filename');
  for (const item of await listSavedExports(store, editId)) {
    const directory = path.join(store.editDir(editId), 'exports', item.exportId);
    let job;
    try { job = JSON.parse(await fs.readFile(path.join(directory, 'job.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (job.exportId !== item.exportId || job.fileName !== fileName) continue;
    if (item.status !== 'complete') throw failure('export_not_ready', 'Render is not complete', 409);
    const extension = path.extname(fileName).toLowerCase();
    const mimeType = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.gif': 'image/gif' }[extension];
    if (!mimeType) throw failure('export_format_unsupported', 'Unsupported render download format');
    const file = path.join(directory, 'output' + extension), info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw failure('export_not_ready', 'Render file is unavailable', 409);
    return { file, size: info.size, mimeType };
  }
  throw failure('export_not_found', 'Owned render file was not found', 404);
}
