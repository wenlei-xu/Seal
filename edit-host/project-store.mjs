import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function failure(reason, message, status = 400) {
  return Object.assign(new Error(message), { reason, status });
}

export function safeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw failure('invalid_id', 'Invalid project identifier');
  }
  return value;
}

export function sourcePath(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || /[:\x00-\x1f]/.test(name)
    || name.split('/').some(part => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))) {
    throw failure('unsafe_path', 'Only project-relative paths are accepted');
  }
  const target = path.resolve(root, name);
  const rel = path.relative(root, target);
  if (path.isAbsolute(rel) || rel.startsWith('..')) throw failure('unsafe_path', 'Path escapes project');
  return target;
}

export async function assertPlainTree(root) {
  async function walk(dir) {
    const info = await fs.lstat(dir);
    if (info.isSymbolicLink()) throw failure('unsafe_link', 'Links and junctions are not project files');
    if (!info.isDirectory()) return;
    for (const name of await fs.readdir(dir)) await walk(path.join(dir, name));
  }
  await walk(root);
}

export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(tmp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(tmp, file);
}

// Publish a complete source file outside the watched tree. On Windows a
// history reader can briefly hold the old file; retry only that rename.
export async function atomicProjectSource(store, editId, name, content) {
  const target = sourcePath(store.workDir(editId), name);
  const staging = path.join(store.editDir(editId), 'incoming');
  await fs.mkdir(staging, { recursive: true });
  const temporary = path.join(staging, crypto.randomUUID());
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); }
  finally { await handle.close(); }
  try {
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, target); break; }
      catch (error) {
        if (process.platform !== 'win32' || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ignored = rel => /(^|\/)(node_modules|\.git|renders|\.cache)(\/|$)/.test(rel)
  || rel.startsWith('.hyperframes/preview/') || rel.startsWith('.hyperframes/proxies/');

export function createProjectStore(root) {
  const locks = new Map();
  const rootPath = path.resolve(root);
  const editDir = editId => path.join(rootPath, 'edits', safeId(editId));
  const workDir = editId => path.join(editDir(editId), 'project');
  const manifestPath = editId => path.join(editDir(editId), 'state.json');

  async function locked(editId, task) {
    safeId(editId);
    const previous = locks.get(editId) || Promise.resolve();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => held, () => held);
    locks.set(editId, tail);
    await previous;
    try { return await task(); }
    finally { release(); if (locks.get(editId) === tail) locks.delete(editId); }
  }

  async function state(editId) {
    try { return JSON.parse(await fs.readFile(manifestPath(editId), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw failure('edit_not_found', 'Edit does not exist', 404); throw error; }
  }

  async function ensure(projectId) {
    const editId = `edit_${hash(safeId(projectId)).slice(0, 24)}`;
    return locked(editId, async () => {
      try { return await state(editId); }
      catch (error) { if (error.reason !== 'edit_not_found') throw error; }
      await fs.mkdir(workDir(editId), { recursive: true });
      const next = { schemaVersion: 1, projectId, editId, revision: 0, receipts: {}, createdAt: new Date().toISOString() };
      await atomicJson(manifestPath(editId), next);
      return next;
    });
  }

  async function snapshot(editId) {
    await assertPlainTree(workDir(editId));
    const manifest = {};
    async function walk(dir, prefix = '') {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const rel = `${prefix}${entry.name}`;
        if (ignored(rel)) continue;
        if (entry.isDirectory()) { await walk(path.join(dir, entry.name), `${rel}/`); continue; }
        const bytes = await fs.readFile(path.join(dir, entry.name));
        const digest = hash(bytes);
        const blob = path.join(rootPath, 'blobs', digest);
        await fs.mkdir(path.dirname(blob), { recursive: true });
        await fs.writeFile(blob, bytes, { flag: 'wx', mode: 0o600 }).catch(error => {
          if (error.code !== 'EEXIST') throw error;
        });
        manifest[rel] = digest;
      }
    }
    await walk(workDir(editId));
    return manifest;
  }

  async function restore(editId, manifest) {
    const current = await snapshot(editId);
    for (const rel of Object.keys(current)) {
      if (!(rel in manifest)) await fs.unlink(sourcePath(workDir(editId), rel));
    }
    for (const [rel, digest] of Object.entries(manifest)) {
      if (!/^[a-f0-9]{64}$/.test(digest)) throw failure('invalid_checkpoint', 'Invalid checkpoint');
      if (current[rel] === digest) continue;
      const file = sourcePath(workDir(editId), rel);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.copyFile(path.join(rootPath, 'blobs', digest), file);
    }
  }

  async function recover(editId) {
    const journal = path.join(editDir(editId), 'journal.json');
    let pending;
    try { pending = JSON.parse(await fs.readFile(journal, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    const current = await state(editId);
    // Publishing state+receipt is the commit point. A crash before it restores the entire source checkpoint.
    if (!current.receipts[pending.operationId]) await restore(editId, pending.before);
    await fs.unlink(journal);
    return true;
  }

  async function transaction(editId, { operationId, expectedRevision, requestKey }, mutate) {
    safeId(operationId);
    return locked(editId, async () => {
      await recover(editId);
      const current = await state(editId);
      const prior = current.receipts[operationId];
      if (prior) {
        if (prior.requestKey !== requestKey) throw failure('operation_reused', 'Operation identifier belongs to another request', 409);
        return { ...prior, replayed: true };
      }
      if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) {
        throw failure('revision_conflict', 'The edit changed while this task was running; its candidate is preserved', 409);
      }
      const before = await snapshot(editId);
      const journal = path.join(editDir(editId), 'journal.json');
      await atomicJson(journal, { operationId, before });
      let published = false;
      try {
        const result = await mutate(workDir(editId), { state: current, before });
        const after = await snapshot(editId);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        const receipt = { operationId, requestKey, revision: current.revision + Number(changed), result };
        await atomicJson(manifestPath(editId), { ...current, revision: receipt.revision,
          receipts: { ...current.receipts, [operationId]: receipt } });
        published = true;
        await fs.unlink(journal);
        return receipt;
      } catch (error) {
        if (!published) { await restore(editId, before); await fs.unlink(journal); }
        throw error;
      }
    });
  }

  return { root: rootPath, editDir, workDir, ensure, state, locked, snapshot, recover, transaction, busy: () => locks.size };
}
