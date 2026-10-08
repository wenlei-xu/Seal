import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProjectStore, atomicJson, sourcePath } from '../project-store.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-edit-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createProjectStore(root);
  const edit = await store.ensure('canvas_1');
  await fs.writeFile(path.join(store.workDir(edit.editId), 'index.html'), 'initial');
  return { store, edit, file: path.join(store.workDir(edit.editId), 'index.html') };
}

test('two writers at the same revision cannot overwrite each other; retry is idempotent', async t => {
  const { store, edit, file } = await fixture(t);
  let writes = 0;
  const command = { operationId: 'task_a', expectedRevision: 0, requestKey: 'a' };
  const results = await Promise.allSettled([
    store.transaction(edit.editId, command, async () => { writes++; await fs.writeFile(file, 'human'); return 'saved'; }),
    store.transaction(edit.editId, { ...command, operationId: 'task_b' }, () => fs.writeFile(file, 'agent')),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].reason.reason, 'revision_conflict');
  assert.equal(await fs.readFile(file, 'utf8'), 'human');
  assert.equal((await store.transaction(edit.editId, command, () => { writes++; })).replayed, true);
  assert.equal(writes, 1);
  await assert.rejects(store.transaction(edit.editId, { ...command, requestKey: 'different' }, () => {}), { reason: 'operation_reused' });
});

test('a failed multi-file mutation restores removed files and removes partial additions', async t => {
  const { store, edit, file } = await fixture(t);
  await assert.rejects(store.transaction(edit.editId, { operationId: 'failure', expectedRevision: 0, requestKey: 'x' }, async dir => {
    await fs.unlink(file);
    await fs.writeFile(path.join(dir, 'partial.css'), 'partial');
    throw new Error('disk or validation failure');
  }));
  assert.equal(await fs.readFile(file, 'utf8'), 'initial');
  await assert.rejects(fs.stat(path.join(store.workDir(edit.editId), 'partial.css')), { code: 'ENOENT' });
  assert.equal((await store.state(edit.editId)).revision, 0);
});

test('interrupted unpublished transaction is recovered on reopen', async t => {
  const { store, edit, file } = await fixture(t);
  const before = await store.snapshot(edit.editId);
  await atomicJson(path.join(store.editDir(edit.editId), 'journal.json'), { operationId: 'interrupted', before });
  await fs.writeFile(file, 'partial write');
  const reopened = createProjectStore(store.root);
  assert.equal(await reopened.recover(edit.editId), true);
  assert.equal(await fs.readFile(file, 'utf8'), 'initial');
});

test('project paths reject Windows traversal, alternate streams and device names', () => {
  for (const name of ['../secret', 'a/../../secret', 'C:/secret', 'a\\secret', 'a:stream', 'NUL.txt', 'a./x', '/root']) {
    assert.throws(() => sourcePath('C:/project', name), { reason: 'unsafe_path' });
  }
});
