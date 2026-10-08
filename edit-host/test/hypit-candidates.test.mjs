import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { createProjectStore } from '../project-store.mjs';
import { createStudioGateway } from '../studio-gateway.mjs';
import { createHypitScenes } from '../hypit-scenes.mjs';
import { initializeProject } from '../starter.mjs';
import { compileHypitBundle } from '../scripts/hypit-fixture.mjs';

const hypitRoot = process.env.BEEFTV_TEST_HYPIT_ROOT;
test('missing or changed resources cannot partially import, and a stale Hypit candidate preserves human edits', { skip: !hypitRoot }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-candidate-test-'));
  const store = createProjectStore(root);
  const edit = await store.ensure('candidate_test');
  await initializeProject(store.workDir(edit.editId));
  const gateway = createStudioGateway(store);
  const scenes = createHypitScenes(store, gateway);
  t.after(async () => { await gateway.close(); await fs.rm(root, { recursive: true, force: true }); });
  const bundle = await compileHypitBundle(hypitRoot, { rich: true });
  await assert.rejects(scenes.create(edit.editId, { ...bundle, resources: [], baseRevision: 0 }), { reason: 'resource_missing' });
  const changed = await scenes.create(edit.editId, { ...bundle, baseRevision: 0 });
  await fs.appendFile(path.join(store.editDir(edit.editId), 'candidates', changed.candidateId, 'assets', 'font.ttf'), 'changed');
  await assert.rejects(scenes.promote(edit.editId, { candidateId: changed.candidateId, operationId: 'corrupt' }), { reason: 'candidate_changed' });
  assert.equal((await store.state(edit.editId)).revision, 0);
  const owned = await gateway.open(edit.editId);
  await owned.history.flush();
  assert.equal(owned.history.list().length, 0, 'Rejected candidates must not create partial undo entries');
  const stale = await scenes.create(edit.editId, { ...bundle, baseRevision: 0 });
  await store.transaction(edit.editId, { operationId: 'human_edit', expectedRevision: 0, requestKey: 'human' }, async dir => {
    const entry = path.join(dir, 'index.html');
    await fs.writeFile(entry, (await fs.readFile(entry, 'utf8')).replace('data-duration="1"', 'data-duration="8"'));
  });
  await assert.rejects(scenes.promote(edit.editId, { candidateId: stale.candidateId, operationId: 'stale' }), { reason: 'revision_conflict' });
  assert.match(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8'), /data-duration="8"/);
  assert.ok((await scenes.list(edit.editId)).some(candidate => candidate.candidateId === stale.candidateId));
  const reviewed = { candidateId: stale.candidateId, operationId: 'reviewed_add', expectedRevision: 1, append: true };
  const imported = await scenes.promote(edit.editId, reviewed);
  assert.equal(imported.revision, 2);
  assert.match(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8'), /data-duration="8"/, 'Explicit addition preserves the human duration');
  assert.equal((await scenes.promote(edit.editId, reviewed)).replayed, true);
  await assert.rejects(scenes.promote(edit.editId, { ...reviewed, operationId: 'another_add', expectedRevision: 2 }), { reason: 'candidate_already_used' });
  const oldFile = `scenes/${stale.sceneId}/scene.html`;
  await store.transaction(edit.editId, { operationId: 'manual_scene', expectedRevision: 2, requestKey: 'manual_scene' }, async dir => {
    const window = await owned.history.beginWindow({ kind: 'person', name: 'You' }, 'Manual scene edit');
    try {
      const scene = path.join(dir, oldFile);
      await fs.writeFile(scene, (await fs.readFile(scene, 'utf8')).replaceAll('Hypit scene', 'Manual title'));
      const entry = path.join(dir, 'index.html');
      const { document } = parseHTML(await fs.readFile(entry, 'utf8'));
      const clip = document.getElementById(stale.sceneId);
      clip.setAttribute('data-start', '2'); clip.setAttribute('data-duration', '1.25'); clip.setAttribute('data-track-index', '4');
      await fs.writeFile(entry, document.toString());
    } finally { await window.close(); }
  });
  const replacement = await scenes.create(edit.editId, { ...bundle, baseRevision: 3 });
  await assert.rejects(scenes.promote(edit.editId, { candidateId: replacement.candidateId, operationId: 'not_found', replaceSceneId: 'missing' }), { reason: 'replace_target_missing' });
  const replaced = await scenes.promote(edit.editId, { candidateId: replacement.candidateId, operationId: 'replace', replaceSceneId: stale.sceneId, actor: 'person' });
  assert.equal(replaced.result.start, 2); assert.equal(replaced.result.duration, 1.25);
  let { document } = parseHTML(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8'));
  let clip = document.getElementById(stale.sceneId);
  assert.equal(clip.getAttribute('data-track-index'), '4');
  assert.equal(clip.getAttribute('data-composition-src'), `scenes/${replacement.sceneId}/scene.html`);
  assert.match(await fs.readFile(path.join(store.workDir(edit.editId), oldFile), 'utf8'), /Manual title/);
  await owned.history.flush();
  assert.equal(owned.history.list().at(-1)?.label, 'Replace Hypit scene');
  await store.transaction(edit.editId, { operationId: 'undo_replace', expectedRevision: 4, requestKey: 'undo_replace' }, async () => {
    const response = await owned.studio.app.request(`/api/projects/${edit.editId}/history/step`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: 'back' }) });
    assert.equal(response.status, 200);
  });
  ({ document } = parseHTML(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8')));
  clip = document.getElementById(stale.sceneId);
  assert.equal(clip.getAttribute('data-composition-src'), oldFile, 'Native undo restores the old editable scene');
  assert.match(await fs.readFile(path.join(store.workDir(edit.editId), oldFile), 'utf8'), /Manual title/);
  const agentCandidate = await scenes.create(edit.editId, { ...bundle, baseRevision: 5 });
  await scenes.promote(edit.editId, { candidateId: agentCandidate.candidateId, operationId: 'agent_replace', replaceSceneId: stale.sceneId });
  await owned.history.flush();
  const agentEntry = owned.history.list().at(-1);
  assert.equal(agentEntry.who.kind, 'agent');
  await store.transaction(edit.editId, { operationId: 'undo_agent', expectedRevision: 6, requestKey: 'undo_agent' }, async () => {
    const response = await owned.studio.app.request(`/api/projects/${edit.editId}/history/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: agentEntry.id, who: { kind: 'agent', name: 'BeefTV' } }) });
    assert.equal((await response.json()).ok, true);
  });
  ({ document } = parseHTML(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8')));
  assert.equal(document.getElementById(stale.sceneId).getAttribute('data-composition-src'), oldFile);
});
