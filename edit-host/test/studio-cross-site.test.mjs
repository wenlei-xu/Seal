import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer-core';
import { createProjectStore } from '../project-store.mjs';
import { createStudioGateway } from '../studio-gateway.mjs';
import { initializeProject } from '../starter.mjs';

test('native desktop cross-site iframe retains its own scoped Studio session', { skip: !process.env.BEEFTV_TEST_CHROME, timeout: 30000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv desktop iframe '));
  const store = createProjectStore(directory), edit = await store.ensure('desktop_iframe');
  await initializeProject(store.workDir(edit.editId));
  const gateway = createStudioGateway(store), owned = await gateway.open(edit.editId);
  let ticket;
  const frontend = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(`<!doctype html><html><body><iframe name="studio"></iframe><form target="studio" method="post" action="${owned.origin}/__session"><input name="ticket" value="${ticket}"></form><script>document.querySelector('form').submit()</script></body></html>`); });
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  const parentOrigin = `http://wails.localhost:${frontend.address().port}`;
  ticket = owned.ticket(parentOrigin).ticket;
  const browser = await puppeteer.launch({ executablePath: process.env.BEEFTV_TEST_CHROME, headless: true, args: ['--host-resolver-rules=MAP wails.localhost 127.0.0.1'] });
  t.after(async () => { await browser.close(); frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve)); await gateway.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const page = await browser.newPage();
  const responses = [];
  const loaded = new Promise(resolve => page.on('response', response => {
    const url = new URL(response.url()); responses.push({ origin: url.origin, path: url.pathname, status: response.status() });
    if (url.origin === owned.origin && url.pathname === '/') resolve(response);
  }));
  await page.goto(parentOrigin);
  let timeout;
  const response = await Promise.race([loaded, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Studio iframe navigation timed out: ' + JSON.stringify(responses))), 10000); })]).finally(() => clearTimeout(timeout));
  assert.equal(response.status(), 200, await response.text());
  const frame = page.frames().find(value => value.url().startsWith(owned.origin + '/'));
  assert.ok(frame);
  const state = await frame.evaluate(async editId => {
    const response = await fetch(`/api/projects/${editId}`); return { status: response.status, text: await response.text() };
  }, edit.editId);
  assert.equal(state.status, 200, state.text);
  const cookie = (await browser.defaultBrowserContext().cookies()).find(value => value.name.startsWith('beeftv_edit_'));
  assert.ok(cookie);
  const route = `${owned.origin}/api/projects/${edit.editId}/file-mutations/patch-element/index.html`;
  const mutation = { target: { id: 'main' }, operations: [{ type: 'attribute', property: 'data-duration', value: '2' }] };
  const rejected = await fetch(route, { method: 'POST', headers: { Cookie: `${cookie.name}=${cookie.value}`, Origin: parentOrigin,
    'Content-Type': 'application/json', 'X-Beeftv-Edit-Revision': '0', 'X-Beeftv-Operation': 'parent_cannot_write' }, body: JSON.stringify(mutation) });
  assert.equal(rejected.status, 403);
  assert.equal((await store.state(edit.editId)).revision, 0);
  const written = await frame.evaluate(async ({ route, mutation }) => {
    const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Beeftv-Edit-Revision': '0', 'X-Beeftv-Operation': 'native_frame_write' }, body: JSON.stringify(mutation) });
    return { status: response.status, text: await response.text() };
  }, { route, mutation });
  assert.equal(written.status, 200, written.text);
  assert.equal((await store.state(edit.editId)).revision, 1);
});
