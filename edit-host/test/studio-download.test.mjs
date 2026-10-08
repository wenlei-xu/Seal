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

test('completed export downloads from the partitioned desktop iframe without losing permission', { skip: !process.env.BEEFTV_TEST_CHROME, timeout: 30000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-export-download-'));
  const store = createProjectStore(directory), edit = await store.ensure('desktop_download');
  await initializeProject(store.workDir(edit.editId));
  const exportId = 'export_download', fileName = 'completed-export.mp4';
  const exported = path.join(store.editDir(edit.editId), 'exports', exportId);
  const bytes = process.env.BEEFTV_TEST_EXPORT_FILE
    ? await fs.readFile(process.env.BEEFTV_TEST_EXPORT_FILE)
    : Buffer.from('local completed export fixture');
  await fs.mkdir(exported, { recursive: true });
  await fs.writeFile(path.join(exported, 'input.json'), JSON.stringify({ editId: edit.editId, exportId, revision: 0, createdAt: new Date().toISOString(), options: { format: 'mp4' } }));
  await fs.writeFile(path.join(exported, 'status.json'), JSON.stringify({ exportId, status: 'complete', progress: 100 }));
  await fs.writeFile(path.join(exported, 'job.json'), JSON.stringify({ exportId, fileName }));
  await fs.writeFile(path.join(exported, 'output.mp4'), bytes);
  const gateway = createStudioGateway(store), owned = await gateway.open(edit.editId);
  let ticket;
  const frontend = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><iframe name="studio"></iframe><form target="studio" method="post" action="${owned.origin}/__session"><input name="ticket" value="${ticket}"></form><script>document.querySelector('form').submit()</script>`);
  });
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  const parentOrigin = `http://wails.localhost:${frontend.address().port}`;
  ticket = owned.ticket(parentOrigin).ticket;
  const browser = await puppeteer.launch({ executablePath: process.env.BEEFTV_TEST_CHROME, headless: true, args: ['--host-resolver-rules=MAP wails.localhost 127.0.0.1'] });
  t.after(async () => { await browser.close(); frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve)); await gateway.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => { const url = new URL(request.url()); if (['wails.localhost','127.0.0.1','localhost'].includes(url.hostname) || ['data:','blob:'].includes(url.protocol)) void request.continue(); else void request.abort(); });
  const loaded = page.waitForResponse(response => { const url = new URL(response.url()); return url.origin === owned.origin && url.pathname === '/'; }, { timeout: 10000 });
  await page.goto(parentOrigin, { waitUntil: 'domcontentloaded', timeout: 10000 });
  assert.equal((await loaded).status(), 200);
  const frame = await page.waitForFrame(value => value.url().startsWith(owned.origin + '/'), { timeout: 10000 });
  assert.ok(frame);
  const route = `/api/projects/${edit.editId}/renders/file/${fileName}`;
  const fetched = await frame.evaluate(async route => { const response = await fetch(route); return { status: response.status, text: await response.text() }; }, route);
  assert.equal(fetched.status, 200, fetched.text);
  assert.equal((await fetch(owned.origin + route)).status, 403, 'untrusted direct requests must remain blocked');
  const downloads = path.join(directory, 'downloads');
  await fs.mkdir(downloads);
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  let timeout;
  const finished = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('export download did not finish')), 10000);
    cdp.on('Browser.downloadProgress', event => { if (event.state !== 'inProgress') resolve(event); });
  });
  await frame.evaluate(({ route, fileName }) => {
    const link = document.createElement('a'); link.href = route; link.download = fileName;
    link.click();
  }, { route, fileName });
  const result = await finished.finally(() => clearTimeout(timeout));
  assert.equal(result.state, 'completed', 'browser export download lost its permission despite a successful authenticated fetch');
  assert.deepEqual(await fs.readFile(path.join(downloads, fileName)), bytes);
});
