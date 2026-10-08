import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { parseHTML } from 'linkedom';
import { createProjectStore } from '../project-store.mjs';
import { createStudioGateway } from '../studio-gateway.mjs';
import { createLibraryMedia } from '../library-media.mjs';
import { initializeProject } from '../starter.mjs';

test('library imports retain asset provenance, append clips, replay once, reject stale writes and undo', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-library-'));
  const store = createProjectStore(root);
  const edit = await store.ensure('library_test');
  await initializeProject(store.workDir(edit.editId));
  const gateway = createStudioGateway(store);
  t.after(async () => { await gateway.close(); await fs.rm(root, { recursive: true, force: true }); });
  const media = createLibraryMedia(store, gateway);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA9sAAAAASUVORK5CYII=', 'base64');
  const input = { assetId: 'asset:original', resourceId: 'resource-original', title: '<图像>', kind: 'image', mimeType: 'image/png',
    size: bytes.length, width: 1, height: 1, operationId: 'import_image', expectedRevision: 0 };
  const receipt = await media.importMedia(edit.editId, input, Readable.from(bytes));
  assert.equal(receipt.revision, 1);
  assert.equal(receipt.result.start, 0);
  assert.equal((await media.importMedia(edit.editId, input, Readable.from(bytes))).replayed, true);
  await assert.rejects(media.importMedia(edit.editId, { ...input, operationId: 'stale' }, Readable.from(bytes)), { reason: 'revision_conflict' });
  await assert.rejects(media.importMedia(edit.editId, { ...input, operationId: 'broken', expectedRevision: 1 }, Readable.from(bytes.subarray(0, 5))), { reason: 'media_size_mismatch' });
  const read = async () => parseHTML(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8')).document;
  let document = await read();
  const image = document.querySelector('img');
  assert.equal(image.getAttribute('data-beeftv-asset-id'), input.assetId);
  assert.equal(image.getAttribute('data-label'), input.title);
  assert.equal(image.getAttribute('data-duration'), '5');
  assert.equal(image.getAttribute('data-start'), '0');
  assert.ok(image.getAttribute('data-hf-id'));
  assert.deepEqual(await fs.readFile(path.join(store.workDir(edit.editId), image.getAttribute('src'))), bytes);
  const second = await media.importMedia(edit.editId, { ...input, operationId: 'import_second', expectedRevision: 1 }, Readable.from(bytes));
  assert.equal(second.result.start, 5);
  assert.equal((await read()).querySelectorAll('img').length, 2);
  const owned = await gateway.open(edit.editId);
  await owned.history.flush();
  assert.equal(owned.history.list().length, 2, 'Rejected or replayed imports create no history entry');
  await store.transaction(edit.editId, { operationId: 'undo_import', expectedRevision: 2, requestKey: 'undo' }, async () => {
    const response = await owned.studio.app.request(`/api/projects/${edit.editId}/history/step`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: 'back' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true, JSON.stringify(result));
  });
  document = await read();
  assert.equal(document.querySelectorAll('img').length, 1);
  assert.deepEqual(await fs.readdir(path.join(store.editDir(edit.editId), 'incoming')), []);
});
