import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createServer as createTCPServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { fixture } from '../../edit-host/test/author-fixture.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nativeExecutable = process.env.BEEFTV_TEST_DESKTOP_EXE;
const run = promisify(execFile);
const id = 'edit_ui_' + crypto.randomUUID().replaceAll('-', '');
const directory = path.join(repo, '.local/project-workbench-debug', id);
const artifacts = path.join(repo, '.local/cache/edit-product-browser', id);
await fs.mkdir(directory, { recursive: true }); await fs.mkdir(artifacts, { recursive: true });
const readyFile = path.join(directory, 'private-ready.json');
const checks = [], errors = [], failedRequests = [];
const pending = new Map();
let child, browser, closed, log = '', config, page, nativeOrigin;
const frontend = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://wails.localhost').pathname;
    let file = path.resolve(repo, 'web/dist', '.' + pathname);
    assert.ok(file.startsWith(path.join(repo, 'web/dist') + path.sep) || file === path.join(repo, 'web/dist'));
    try { if (!(await fs.stat(file)).isFile()) file = path.join(repo, 'web/dist/index.html'); } catch { file = path.join(repo, 'web/dist/index.html'); }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }); response.end(await fs.readFile(file));
  } catch (error) { response.writeHead(500).end(error.message); }
});
const check = (name, details = {}) => { checks.push({ name, ...details }); console.log('PASS', name); };
try {
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  let origin = `http://wails.localhost:${frontend.address().port}`, cdpPort;
  if (nativeExecutable) {
    const reservation = createTCPServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    cdpPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    origin = 'http://wails.localhost';
  }
  child = spawn(nativeExecutable || path.join(repo, '.local/cache/edit-browser-tools/backend-fixture.exe'), [], { cwd: repo, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: {
    ...process.env, BEEFTV_BROWSER_DATA_DIR: directory, BEEFTV_BROWSER_READY_FILE: readyFile, BEEFTV_ALLOWED_ORIGINS: origin,
    ...(nativeExecutable ? { CANVAS_DESKTOP_DATA_DIR: directory, BEEFTV_TEST_CDP_PORT: String(cdpPort) } : {}),
    BEEFTV_EDIT_HOST_ENTRY: path.join(repo, 'edit-host/server.mjs'), BEEFTV_EDIT_NODE: process.env.BEEFTV_TEST_NODE || process.execPath,
  } });
  closed = new Promise(resolve => child.once('close', resolve));
  child.stdout.on('data', data => { log = (log + data).slice(-16000); }); child.stderr.on('data', data => { log = (log + data).slice(-16000); });
  const deadline = Date.now() + 30000;
  while (!config && Date.now() < deadline) {
    assert.equal(child.exitCode, null, log);
    try {
      if (nativeExecutable) {
        if (!browser) browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 1000 });
        page = browser.contexts()[0].pages().find(value => value.url().includes('wails.localhost'));
        if (page) { config = await page.evaluate(() => window.go?.main?.DesktopApp?.RuntimeConfig()); nativeOrigin = new URL(page.url()).origin; origin = nativeOrigin; }
      } else config = JSON.parse(await fs.readFile(readyFile, 'utf8'));
    } catch { await delay(100); }
  }
  assert.ok(config, log);
  const headers = { 'X-Desktop-Token': config.launchToken, 'X-Beeftv-UI-Bootstrap': config.uiBootstrapToken, Origin: origin };
  async function api(route, method = 'GET', body) {
    const response = await fetch(config.baseURL + route, { method, headers: { ...headers, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const text = await response.text(); assert.equal(response.status, 200, text); const envelope = JSON.parse(text); assert.equal(envelope.code, 0, text); return envelope.data;
  }
  await api(`/canvas-projects/${id}`, 'PUT', { project: { id, title: '剪辑流程验收', revision: 0, nodes: [], connections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  const { stdout: image } = await run(process.env.PRODUCER_FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x96', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { encoding: 'buffer', windowsHide: true });
  const form = new FormData(); form.set('file', new Blob([image], { type: 'image/png' }), 'product.png'); form.set('kind', 'image'); form.set('width', '64'); form.set('height', '96');
  const { resource } = await api('/resources', 'POST', form);
  const assetId = id + '_image';
  await api(`/assets/${assetId}`, 'PUT', { asset: { id: assetId, title: '蓝色产品参考', kind: 'image', category: 'material', status: 'confirmed', tags: [], coverUrl: '',
    data: { storageKey: 'resource:' + resource.id, dataUrl: config.baseURL + `/resources/${resource.id}/file`, width: 64, height: 96, bytes: image.length, mimeType: 'image/png' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  if (!nativeExecutable) browser = await chromium.launch({ executablePath: process.env.BEEFTV_TEST_CHROME, headless: true, args: ['--host-resolver-rules=MAP wails.localhost 127.0.0.1'] });
  const context = nativeExecutable ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(value => {
    if (value && window === window.top) window.go = { main: { DesktopApp: { RuntimeConfig: async () => value } } };
    window.__BEEFTV_TEST_ERRORS = [];
    window.addEventListener('unhandledrejection', event => { const reason = event.reason; window.__BEEFTV_TEST_ERRORS.push({ type: reason?.constructor?.name,
      event: reason?.type, message: reason?.message, stack: reason?.stack, source: reason?.target?.src || reason?.target?.url }); });
  }, nativeExecutable ? null : config);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', 'wails.localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  if (!nativeExecutable) page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => pending.set(request, { method: request.method(), path: new URL(request.url()).pathname, started: Date.now() }));
  page.on('requestfinished', request => pending.delete(request)); page.on('requestfailed', request => pending.delete(request));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: new URL(response.url()).pathname, status: response.status() }); });
  await page.goto(origin + '/#/editing');
  await page.getByRole('button', { name: '新建剪辑工程', exact: true }).click();
  await page.getByRole('textbox', { name: '工程名称', exact: true }).fill('独立剪辑验收');
  await page.getByRole('dialog').getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: '制作任务', exact: true }).waitFor({ timeout: 30000 });
  const projectId = page.url().match(/\/editing\/([^/?#]+)/)[1];
  const canvases = await api('/canvas-projects?page=1&pageSize=500');
  assert.ok(!JSON.stringify(canvases).includes(projectId), 'Creating an edit must not create a hidden canvas');
  const editor = page.frameLocator('iframe[title="HyperFrames 剪辑编辑器"]');
  await editor.getByRole('button', { name: 'Export', exact: true }).waitFor({ timeout: 20000 });
  check('navigation creates an independent editing project and opens the embedded Studio');
  await page.screenshot({ path: path.join(artifacts, 'editor.png') });
  await page.getByRole('button', { name: '资产库', exact: true }).click();
  await page.getByRole('button', { name: '蓝色产品参考', exact: false }).click();
  await page.getByRole('button', { name: '加入轨道', exact: true }).click();
  await page.getByText('工程版本 1', { exact: true }).waitFor({ timeout: 20000 });
  check('asset picker imports the saved resource into the timeline');
  await page.getByRole('button', { name: '制作任务', exact: true }).click();
  await page.getByText('还没有制作任务。', { exact: false }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: /关闭|Close/ }).click();
  check('production panel reads the owned workspace');
  const { editId } = await api(`/edit-projects/${projectId}/open`, 'POST', { parentOrigin: origin, theme: 'dark' });
  const editRoute = action => `/edit-projects/${projectId}/edits/${editId}/${action}`;
  const sized = await api(editRoute('mutate'), 'POST', { expectedRevision: 1, operationId: 'ui_sample_dimensions', route: 'file-mutations/patch-element/index.html', payload: { target: { id: 'main' }, operations: [
    { type: 'attribute', property: 'data-width', value: '320' }, { type: 'attribute', property: 'data-height', value: '480' },
  ] } });
  const input = await api(editRoute('hypit/assets/import'), 'POST', { assetId, expectedRevision: sized.revision, operationId: 'ui_production_input' });
  for (const [file, text] of Object.entries(fixture)) await api(editRoute('hypit/write'), 'POST', { file, text: text.replace('__INPUT__', './' + input.file), expectedHash: null, operationId: 'ui_source_' + Object.keys(fixture).indexOf(file) });
  const job = await api(editRoute('hypit/start'), 'POST', { command: 'build', source: 'main.svrun', expectedRevision: sized.revision, operationId: 'ui_production' });
  let state = job; const buildDeadline = Date.now() + 90000;
  while (state.status === 'running' && Date.now() < buildDeadline) { await delay(200); state = await api(editRoute('hypit/status'), 'POST', { jobId: job.jobId }); }
  assert.equal(state.status, 'complete', JSON.stringify(state));
  await page.getByRole('button', { name: '制作任务', exact: true }).click();
  await page.getByRole('button', { name: '加入轨道末尾', exact: true }).click();
  await page.getByRole('button', { name: '已加入轨道', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: /关闭|Close/ }).click();
  check('completed native Hypit build is added through the production panel');
  await editor.getByText('00:08', { exact: false }).first().waitFor({ timeout: 20000 });
  await editor.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: '导出结果', exact: true }).click();
  await page.getByRole('button', { name: '保存到资产库', exact: true }).waitFor();
  await page.getByRole('button', { name: '保存到资产库', exact: true }).waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(value => value.textContent === '保存到资产库'); return button && !button.disabled; }, undefined, { timeout: 120000 });
  await page.getByRole('button', { name: '保存到资产库', exact: true }).click();
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor({ timeout: 60000 });
  const saved = await api('/assets?page=1&pageSize=40');
  const finished = saved.assets.filter(asset => asset.metadata?.editId === editId);
  assert.equal(finished.length, 1);
  const download = await fetch(config.baseURL + `/resources/${finished[0].data.storageKey.slice('resource:'.length)}/file`, { headers });
  assert.equal(download.status, 200);
  const videoFile = path.join(artifacts, 'ui-combined.mp4'); await fs.writeFile(videoFile, Buffer.from(await download.arrayBuffer()));
  const { stdout: probe } = await run(process.env.PRODUCER_FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', videoFile], { windowsHide: true });
  const video = JSON.parse(probe).streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.width, 320); assert.equal(video.height, 480); assert.equal(Number(video.nb_frames), 240);
  check('native Studio export is saved through the actual asset-library UI');
  await page.reload();
  await page.getByRole('button', { name: '导出结果', exact: true }).click();
  await page.getByRole('button', { name: '保存到资产库', exact: true }).click();
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor({ timeout: 60000 });
  const reopened = await api('/assets?page=1&pageSize=40');
  const videos = reopened.assets.filter(asset => asset.metadata?.editId === editId);
  assert.equal(videos.length, 1); assert.equal(videos[0].id, finished[0].id); assert.equal(videos[0].data.storageKey, finished[0].data.storageKey);
  check('reopened result reuses the same persisted asset and resource');
  await page.getByRole('dialog').getByRole('button', { name: /关闭|Close/ }).click();
  await page.getByRole('link', { name: '剪辑工程', exact: true }).click();
  await page.getByText('独立剪辑验收', { exact: true }).waitFor();
  await page.goto(origin + '/#/canvas/' + id);
  await page.locator('#canvas-main').waitFor();
  await page.locator('#canvas-main').click({ button: 'right', position: { x: 400, y: 320 } });
  await page.getByRole('button', { name: '从素材库插入', exact: true }).click();
  await page.getByRole('button', { name: finished[0].title, exact: false }).click();
  await page.getByRole('button', { name: /插入已选素材/ }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let canvas, canvasDeadline = Date.now() + 30000;
  while (Date.now() < canvasDeadline) {
    canvas = await api(`/canvas-projects/${id}`);
    if (canvas.project.nodes.some(node => node.metadata?.assetId === finished[0].id)) break;
    await delay(200);
  }
  assert.ok(canvas.project.nodes.some(node => node.metadata?.assetId === finished[0].id));
  check('canvas inserts the finished video from the shared library and persists its asset identity');
  await page.screenshot({ path: path.join(artifacts, 'shared-library.png') });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(artifacts, 'imported.png') });
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(artifacts, 'failed.png') }).catch(() => {});
    const states = await Promise.all(page.frames().map(async frame => ({ url: frame.url().split('?')[0], text: (await frame.locator('body').innerText().catch(() => '')).slice(0, 3000), errors: await frame.evaluate(() => window.__BEEFTV_TEST_ERRORS).catch(() => []) })));
    const buttons = await page.locator('button').evaluateAll(values => values.map(value => ({ text: value.textContent, html: value.outerHTML,
      hiddenParent: value.closest('[aria-hidden="true"]')?.outerHTML.slice(0, 200), box: value.getBoundingClientRect().toJSON() }))).catch(() => []);
    await fs.writeFile(path.join(artifacts, 'failure-state.json'), JSON.stringify({ error: error.message, states, buttons, pending: [...pending.values()], backendLog: log }, null, 2));
  }
  throw error;
} finally {
  if (nativeExecutable && page && child?.exitCode === null) {
    await page.evaluate(() => window.runtime.Quit()).catch(() => {});
    await Promise.race([closed, delay(10000)]);
  }
  if (browser) await browser.close();
  if (child && child.exitCode === null) { child.stdin.end(); await Promise.race([closed, delay(10000)]); if (child.exitCode === null) { child.kill(); await closed; } }
  frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve));
  await fs.unlink(readyFile).catch(() => {});
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: nativeExecutable ? 'actual Windows Wails window + WebView2 + native bindings + desktop backend + Studio; tagged debugging build' : 'production React + desktop backend + actual Studio; native Wails binding represented by test bootstrap', nativeOrigin, checks, errors, failedRequests }, null, 2));
}
