import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSessionStore } from './session-owner.mjs';
import { createFullControlLoader } from './full-control-loader.mjs';
import { readSnapshotSkillFile } from './skill-read-bridge.mjs';

test('official Pi reload applies the next turn skill snapshot without replacing the session', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beeftv-skill-hub-'));
  const scope = 'a'.repeat(64);
  const root = path.join(dir, 'skill-runtime', scope, 'sample', 'v1');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'SKILL.md'), '---\nname: sample\ndescription: Local editing workflow\n---\nRead the supplied footage.');
  fs.writeFileSync(path.join(root, '.gitignore'), '*');
  const first = { userScope: scope, revision: 'v1', skills: [{ id: 'sample', name: 'sample', root, version: '1', contentHash: 'hash' }] };
  const disabled = { userScope: scope, revision: 'v2', skills: [] };
  const store = createSessionStore({ sessionRoot: path.join(dir, 'sessions'), workspaceRoot: path.join(dir, 'workspace'), agentDir: path.join(dir, 'agent'), runId: 'local', getModelRuntime: () => null, getModel: () => null, resourceLoaderFactory: () => createFullControlLoader({ managed: true, dataDir: dir }) });
  const tools = () => [{ name: 'read', label: 'Read skill', description: 'Read local skill', parameters: { type: 'object', properties: {} }, execute: async () => ({ content: [{ type: 'text', text: '' }] }) }];
  try {
    const live = await store.acquireChatSession('canvas', tools, '', first);
    const id = live.sessionId;
    expect(live.session.systemPrompt).toContain('<name>sample</name>');
    expect((await readSnapshotSkillFile(first, path.join(root, 'SKILL.md'))).skill.name).toBe('sample');
    await expect(readSnapshotSkillFile(disabled, path.join(root, 'SKILL.md'))).rejects.toThrow('skill_read_path_out_of_scope');
    await expect(store.acquireChatSession('canvas', tools, id, disabled)).rejects.toMatchObject({ reason: 'session_busy' });
    store.releaseChatSession(live);
    const next = await store.acquireChatSession('canvas', tools, id, disabled);
    expect(next.sessionId).toBe(id);
    expect(next.session.systemPrompt).not.toContain('<name>sample</name>');
    expect(next.session.systemPrompt).toContain('本轮可用 Skill：无');
    store.releaseChatSession(next);
  } finally { await store.disposeAll(); fs.rmSync(dir, { recursive: true, force: true }); }
});
