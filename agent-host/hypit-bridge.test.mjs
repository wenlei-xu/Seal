import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHypitBridge } from './hypit-bridge.mjs';
import { createFullControlLoader } from './full-control-loader.mjs';

const parameters = { opsUrl: 'http://127.0.0.1:1/api', hostToken: 'test-only', desktopToken: 'test-only', turnBudgetContext: new AsyncLocalStorage() };
test('read-only Hypit sessions expose references and status without authoring or production writes', () => {
  const tools = createHypitBridge({ ...parameters, readOnly: true }).buildTools('canvas_1', [], {}, {}, 'session_1');
  assert.deepEqual(tools.map(tool => tool.name), ['hypit_project', 'hypit_read', 'hypit_job_status', 'hypit_jobs', 'hypit_reference_frames']);
});
test('Hypit tools reject another project, empty write identity and a cancelled turn before network access', async () => {
  const bridge = createHypitBridge(parameters);
  let tools = bridge.buildTools('canvas_1', [], {}, { workspaceContext: { mode: 'edit', projectId: 'other' } }, 'session_1');
  await assert.rejects(tools[0].execute('read', {}), /hypit_scope_mismatch/);
  tools = bridge.buildTools('canvas_1', [], {}, {}, 'session_1');
  await assert.rejects(tools.find(tool => tool.name === 'hypit_run').execute('', {}), /missing_tool_call_id/);
  tools = bridge.buildTools('canvas_1', [], { aborted: true }, {}, 'session_1');
  await assert.rejects(tools[0].execute('read', {}), /aborted/);
});
test('existing session lazily opens one Hypit workspace, keeps stable scoped operations and returns real reference images', async t => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let text = ''; for await (const bytes of request) text += bytes;
    requests.push({ url: request.url, headers: request.headers, input: JSON.parse(text) });
    const data = request.url.endsWith('/production') ? { editId: 'edit_1', revision: 4 }
      : request.url.endsWith('/frames') ? { inputId: 'input_1', title: 'Reference', durationMs: 1000, frames: [{ time: 0, data: 'test-image', mimeType: 'image/jpeg' }] }
      : request.url.endsWith('/promote') ? { revision: 5 } : { jobId: 'job_1', status: 'running' };
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 0, data }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const log = [], turn = { turnId: 'turn_1' };
  const bridge = createHypitBridge({ ...parameters, opsUrl: `http://127.0.0.1:${server.address().port}/api` });
  const tools = bridge.buildTools('canvas_1', log, {}, turn, 'persistent_session');
  const run = tools.find(tool => tool.name === 'hypit_run');
  await run.execute('call_1', { command: 'build', source: 'main.svrun' });
  await run.execute('call_1', { command: 'build', source: 'main.svrun' });
  assert.equal(requests.filter(request => request.url.endsWith('/production')).length, 1);
  assert.equal(requests[1].input.operationId, requests[2].input.operationId);
  assert.equal(requests[1].input.expectedRevision, 4);
  assert.equal(requests[1].headers['x-beeftv-agent-turn'], 'turn_1');
  assert.match(requests[1].url, /canvas_1\/edits\/edit_1\/hypit\/start$/);
  const result = await tools.find(tool => tool.name === 'hypit_reference_frames').execute('frames', { inputId: 'input_1', times: [0] });
  assert.deepEqual(result.content[1], { type: 'image', data: 'test-image', mimeType: 'image/jpeg' });
  assert.ok(!JSON.stringify(log).includes('test-image'), 'Image bytes do not enter operation logs');
  await tools.find(tool => tool.name === 'hypit_add_scene').execute('add', { candidateId: 'candidate_1', start: 0, track: 0 });
  await run.execute('call_2', { command: 'build', source: 'main.svrun' });
  assert.equal(requests.at(-1).input.expectedRevision, 5);
});
test('full-control loader registers the installed official Hypit Skill in the existing pi session', { skip: !process.env.BEEFTV_HYPIT_ROOT }, () => {
  const skills = createFullControlLoader().getSkills();
  assert.equal(skills.diagnostics.length, 0);
  assert.ok(skills.skills.some(skill => skill.name === 'hypit' && skill.filePath.endsWith('SKILL.md')));
});
