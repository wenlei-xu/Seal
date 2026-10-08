import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { workflowJournal } from './workflow-journal.mjs';
import { projectTurnHistory } from './canvas-turn.mjs';

test('official journal reopens an interrupted workflow with stable receipts and CAS', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beeftv workflow '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = SessionManager.create(root, path.join(root, 'sessions'));
  manager.appendCustomEntry('beeftv.turn.started', { turnId: 'turn-before', userText: 'create a narrated clip' });
  // The actual SDK records an assistant tool-call message before executing tools.
  manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'checkpoint', name: 'workflow_checkpoint', arguments: {} }], timestamp: Date.now(), stopReason: 'toolUse' });
  const journal = workflowJournal(manager, 'official-session');
  const plan = { title: 'Narrated clip', goal: 'continue the same existing creation', steps: [{ id: 'voice', label: 'Voiceover', state: 'waiting', taskId: 'accepted-once', taskKind: 'generation' }] };
  const first = journal.save(plan, 'tool-write', 'turn-before');
  assert.equal(journal.save(plan, 'tool-write', 'turn-before').revision, 1);
  assert.throws(() => journal.save({ ...plan, goal: 'different work' }, 'tool-write', 'turn-before'), /operation_conflict/);
  const reopened = SessionManager.open(manager.getSessionFile(), path.join(root, 'sessions'), root);
  const restored = workflowJournal(reopened, 'official-session');
  assert.deepEqual(restored.read()[0].steps, first.steps);
  const turns = projectTurnHistory(reopened.getEntries(), 'beeftv.turn');
  assert.equal(turns[0].errorReason, 'turn_interrupted');
  assert.equal(turns[0].workflows[0].steps[0].taskId, 'accepted-once');
  assert.equal(projectTurnHistory(reopened.getEntries(), 'beeftv.turn', 'turn-before').length, 0, 'live turn must not be marked interrupted');
  const next = restored.save({ ...plan, id: first.id, expectedRevision: 1, steps: [{ ...plan.steps[0], state: 'done', operationId: 'existing-receipt' }] }, 'next-tool-write', 'turn-after');
  assert.equal(next.revision, 2);
  assert.throws(() => restored.save({ ...plan, id: first.id, expectedRevision: 1 }, 'stale-write', 'turn-after'), /revision_conflict/);
  assert.equal(workflowJournal(SessionManager.open(manager.getSessionFile(), path.join(root, 'sessions'), root), 'official-session').read()[0].revision, 2);
});
