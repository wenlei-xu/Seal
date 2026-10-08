import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHyperframesBridge } from './hyperframes-bridge.mjs';
import { loadSkills } from '@earendil-works/pi-coding-agent';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('official SDK loads one pinned entry while its full reference suite stays accessible', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills/hyperframes');
  const result = loadSkills({ skillPaths: [path.join(root, 'SKILL.md')], includeDefaults: false, cwd: root, agentDir: root });
  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].name, 'hyperframes');
  assert.equal(result.diagnostics.filter(item => item.type === 'error').length, 0);
});

test('HyperFrames tools preserve the frozen scope, version pin, images, array results and no-rebase promotion', async t => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let bytes = ''; for await (const chunk of req) bytes += chunk;
    const body = JSON.parse(bytes); calls.push({ path: req.url, headers: req.headers, body });
    const data = req.url.endsWith('/context') ? { revision: 7, clips: [] }
      : req.url.endsWith('/inspect') ? { ok: true, images: [{ data: 'YWJj', mimeType: 'image/png' }] }
      : req.url.endsWith('/exports') ? [{ exportId: 'export_1', status: 'complete' }]
      : req.url.endsWith('/promote') ? { revision: 8 } : { candidateId: 'candidate_1' };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 0, data }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const bridge = createHyperframesBridge({ opsUrl: `http://127.0.0.1:${server.address().port}/api`, hostToken: 'private', desktopToken: 'desktop', turnBudgetContext: new AsyncLocalStorage() });
  const turn = { turnId: 'turn', workspaceContext: { mode: 'edit', projectId: 'project_1', editId: 'edit_1', revision: 6 },
    editRevision: 6, skillSnapshot: { skills: [{ name: 'hyperframes', version: '0.8.130' }] } };
  const tools = bridge.buildTools('project_1', [], {}, turn, 'session');
  const tool = name => tools.find(item => item.name === name);
  await tool('hyperframes_context').execute('context', {});
  await tool('hyperframes_candidate').execute('create', { html: '<h1>Hello</h1>', script: 'const tl=gsap.timeline({paused:true})', duration: 2, width: 640, height: 360 });
  assert.equal(calls.at(-1).body.baseRevision, 7);
  assert.match(calls.at(-1).body.operationId, /^[a-f0-9]{64}$/);
  const checked = await tool('hyperframes_check').execute('check', { candidateId: 'candidate_1', command: 'check' });
  assert.equal(checked.content[1].type, 'image'); assert.equal(checked.content[1].data, 'YWJj');
  assert.ok(!checked.content[0].text.includes('YWJj'));
  await tool('hyperframes_add_scene').execute('add', { candidateId: 'candidate_1', start: 0 });
  assert.equal(calls.at(-1).body.expectedRevision, undefined, 'Agent cannot override a candidate starting revision');
  assert.equal(calls.at(-1).headers['x-beeftv-agent-turn'], 'turn');
  assert.equal(turn.editRevision, 8);
  const exports = await tool('hyperframes_exports').execute('exports', {});
  assert.ok(Array.isArray(JSON.parse(exports.content[0].text)));
  turn.workspaceContext.projectId = 'project_2';
  await assert.rejects(tool('hyperframes_candidate').execute('wrong', {}), /edit_scope_required/);
  turn.workspaceContext.projectId = 'project_1'; turn.skillSnapshot.skills = [];
  await assert.rejects(tool('hyperframes_context').execute('disabled', {}), /hyperframes_skill_disabled/);
});
