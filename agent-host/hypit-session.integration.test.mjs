import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createProjectStore } from '../edit-host/project-store.mjs';
import { createStudioGateway } from '../edit-host/studio-gateway.mjs';
import { createHypitScenes } from '../edit-host/hypit-scenes.mjs';
import { createHypitProductions } from '../edit-host/hypit-productions.mjs';
import { initializeProject } from '../edit-host/starter.mjs';
import { fixture } from '../edit-host/test/author-fixture.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
async function readJSON(request) {
  let text = ''; for await (const part of request) text += part;
  return JSON.parse(text || '{}');
}

// The model and Go boundary are local protocol fixtures. pi, Hypit and Studio run their actual code.
test('one real pi session starts native Hypit in canvas and promotes its editable result in editing', { skip: !process.env.BEEFTV_HYPIT_ROOT, timeout: 120000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-pi-hypit-'));
  const store = createProjectStore(path.join(directory, 'editing'));
  const edit = await store.ensure('canvas_1');
  await initializeProject(store.workDir(edit.editId));
  const gateway = createStudioGateway(store), scenes = createHypitScenes(store, gateway);
  const productions = createHypitProductions(store, scenes);
  let child, log = '', modelCalls = 0, phase = 'build', phaseCall = 0, built;
  const requests = [], modelErrors = [];
  const token = 'synthetic-pi-hypit-only';
  const ops = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    try {
      assert.equal(request.headers['x-beeftv-agent-token'], token);
      if (request.url === '/api/ops') {
        response.end(JSON.stringify({ code: 0, data: { ops: [{ id: 'canvas.get', summary: 'Read canvas', readOnly: true, scope: 'canvas', params: { type: 'object', properties: { canvasId: { type: 'string' } }, required: ['canvasId'] } }] } }));
        return;
      }
      const body = await readJSON(request);
      requests.push({ url: request.url, body, turn: request.headers['x-beeftv-agent-turn'] });
      let data;
      if (request.url === '/api/edit-projects/canvas_1/production') data = await productions.open(edit.editId);
      else {
        const prefix = `/api/edit-projects/canvas_1/edits/${edit.editId}/`;
        assert.ok(request.url.startsWith(prefix), 'Tool stays in its project');
        const action = request.url.slice(prefix.length);
        if (action === 'hypit/read') data = await productions.read(edit.editId, body);
        else if (action === 'hypit/write') data = await productions.write(edit.editId, body);
        else if (action === 'hypit/start') data = await productions.start(edit.editId, body);
        else if (action === 'hypit/publish') data = await productions.publish(edit.editId, body);
        else if (action === 'promote') data = await scenes.promote(edit.editId, { ...body, actor: 'agent' });
        else throw new Error('Unexpected route: ' + action);
      }
      response.end(JSON.stringify({ code: 0, data }));
    } catch (error) {
      response.writeHead(error.status || 500).end(JSON.stringify({ code: 1, msg: error.message, reason: error.reason }));
    }
  });
  const model = createServer(async (request, response) => {
    try {
      const body = await readJSON(request); modelCalls++; phaseCall++;
      assert.ok(body.tools.some(tool => tool.function.name === 'hypit_run'), 'Actual session registers Hypit tools');
      let tool;
      if (phase === 'build') {
        if (phaseCall === 1) tool = { name: 'hypit_read', arguments: JSON.stringify({ area: 'skill', file: 'SKILL.md' }) };
        if (phaseCall === 2) tool = { name: 'hypit_write', arguments: JSON.stringify({ file: 'production-note.md', text: 'Native production through the existing session.', expectedHash: null }) };
        if (phaseCall === 3) tool = { name: 'hypit_run', arguments: JSON.stringify({ command: 'build', source: 'main.svrun' }) };
      } else {
        if (phaseCall === 1) tool = { name: 'hypit_candidate', arguments: JSON.stringify({ jobId: built.jobId }) };
        if (phaseCall === 2) {
          const message = body.messages.filter(item => item.role === 'tool').at(-1);
          const result = JSON.parse(typeof message.content === 'string' ? message.content : message.content.find(part => part.type === 'text').text);
          assert.ok(result.candidateId, 'Model receives actual immutable candidate identity');
          tool = { name: 'hypit_add_scene', arguments: JSON.stringify({ candidateId: result.candidateId, start: 0, track: 0 }) };
        }
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta, finish_reason) => response.write('data: ' + JSON.stringify({ id: 'synthetic-' + modelCalls, object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n');
      chunk({ role: 'assistant', ...(tool ? { tool_calls: [{ index: 0, id: 'call_' + modelCalls, type: 'function', function: tool }] } : { content: phase === 'build' ? 'Production started.' : 'Editable scene added.' }) }, null);
      chunk({}, tool ? 'tool_calls' : 'stop'); response.end('data: [DONE]\n\n');
    } catch (error) { modelErrors.push(error.message); response.writeHead(500).end(error.message); }
  });
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('close', resolve)); child.kill('SIGTERM');
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
    }
    await productions.close(); await gateway.close();
    for (const server of [ops, model]) if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(directory, { recursive: true, force: true });
  });
  await productions.open(edit.editId);
  const { stdout: image } = await promisify(execFile)('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x96', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { encoding: 'buffer', windowsHide: true });
  const input = await productions.importAsset(edit.editId, { assetId: 'product', resourceId: 'product-resource', kind: 'image', mimeType: 'image/png', size: image.length, operationId: 'fixture_image', expectedRevision: 0 }, Readable.from(image));
  for (const [file, text] of Object.entries(fixture)) await productions.write(edit.editId, { file, text: text.replace('__INPUT__', './' + input.file), expectedHash: null, operationId: 'fixture_' + Object.keys(fixture).indexOf(file) });
  const opsPort = await listen(ops), modelPort = await listen(model);
  const reservation = createServer(), port = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(repo, 'agent-host/server.mjs')], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, BEEFTV_AGENT_DATA_DIR: path.join(directory, 'agent'), BEEFTV_AGENT_HOST_TOKEN: token,
    BEEFTV_AGENT_PORT: String(port), BEEFTV_OPS_URL: `http://127.0.0.1:${opsPort}/api`, BEEFTV_AGENT_API: 'openai-completions',
    BEEFTV_AGENT_MODEL: 'synthetic', BEEFTV_AGENT_API_KEY: 'synthetic-only', BEEFTV_AGENT_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
    BEEFTV_AGENT_MAX_REQUESTS_PER_TURN: '20', BEEFTV_AGENT_MAX_TOOL_STEPS_PER_TURN: '20', BEEFTV_AGENT_TURN_TIMEOUT_MS: '90000',
  } });
  child.stdout.on('data', part => { log += part; }); child.stderr.on('data', part => { log += part; });
  const healthDeadline = Date.now() + 15000;
  let healthy = false;
  while (Date.now() < healthDeadline) {
    assert.equal(child.exitCode, null, log);
    try { healthy = (await fetch(base + '/health', { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (healthy) break; await delay(100);
  }
  assert.ok(healthy, log);
  async function api(route, body) {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'X-Beeftv-Agent-Token': token }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) });
    const text = await response.text(); assert.equal(response.status, 200, text + log.slice(-2000));
    return route === '/chat' ? text.trim().split('\n').map(line => JSON.parse(line)) : JSON.parse(text);
  }
  const first = await api('/chat', { canvasId: 'canvas_1', message: 'Build the prepared Hypit project; keep it as a candidate.', turnId: 'aa01', revisionBefore: 0 });
  const firstEnd = first.find(event => event.type === 'turn_end');
  assert.ok(firstEnd && !firstEnd.error, JSON.stringify(firstEnd) + log.slice(-2000));
  assert.deepEqual(firstEnd.toolCalls.map(call => call.tool), ['hypit_read', 'hypit_write', 'hypit_run']);
  const history = await api('/history?canvasId=canvas_1'); assert.ok(history.sessionId);
  assert.equal((await store.state(edit.editId)).revision, 0);
  built = (await productions.list(edit.editId))[0]; assert.ok(built);
  const buildDeadline = Date.now() + 90000;
  while (built.status === 'running' && Date.now() < buildDeadline) { await delay(100); built = await productions.status(edit.editId, built.jobId); }
  assert.equal(built.status, 'complete', JSON.stringify(built));
  phase = 'promote'; phaseCall = 0;
  const second = await api('/chat', { canvasId: 'canvas_1', message: 'Add the completed candidate to the timeline at zero.', turnId: 'aa02', revisionBefore: 0, sessionId: history.sessionId,
    workspaceContext: { mode: 'edit', projectId: 'canvas_1', editId: edit.editId, revision: 0, selection: { selection: null } } });
  const secondEnd = second.find(event => event.type === 'turn_end');
  assert.ok(secondEnd && !secondEnd.error, JSON.stringify(secondEnd) + JSON.stringify(modelErrors));
  assert.deepEqual(secondEnd.toolCalls.map(call => call.tool), ['hypit_candidate', 'hypit_add_scene']);
  const after = await api('/history?canvasId=canvas_1');
  assert.equal(after.sessionId, history.sessionId); assert.equal(after.turns.length, 2);
  assert.equal((await store.state(edit.editId)).revision, 1);
  assert.equal(requests.filter(item => item.url.endsWith('/production')).length, 1);
  assert.ok(requests.filter(item => item.url.endsWith('/hypit/start')).every(item => item.turn === 'aa01'));
  assert.ok(requests.filter(item => item.url.endsWith('/promote')).every(item => item.turn === 'aa02'));
  const html = await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8');
  assert.match(html, /scenes\/.*\/scene.html/);
  assert.deepEqual(modelErrors, []); assert.equal(modelCalls, 7);
});
