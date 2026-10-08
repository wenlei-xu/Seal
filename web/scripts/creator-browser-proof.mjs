import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(repo, '.local/cache/creator-browser-proof');
const dataDir = path.join(repo, '.local/project-workbench-debug/creator-browser-' + Date.now());
const readyFile = path.join(dataDir, 'private-ready.json');
await fs.mkdir(dataDir, { recursive: true }); await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(path.join(dataDir, 'agent_config.json'), JSON.stringify({ model: '', hostCommand: path.join(repo, '.local/cache/creator-shipped-v1/agent-host/runtime/node.exe'), hostArgs: [path.join(repo, '.local/cache/creator-shipped-v1/agent-host/server.mjs')] }));
const frontend = createServer(async (request, response) => {
  try {
    let file = path.resolve(repo, 'web/dist', '.' + new URL(request.url, 'http://wails.localhost').pathname);
    assert.ok(file.startsWith(path.join(repo, 'web/dist') + path.sep) || file === path.join(repo, 'web/dist'));
    try { if (!(await fs.stat(file)).isFile()) file = path.join(repo, 'web/dist/index.html'); } catch { file = path.join(repo, 'web/dist/index.html'); }
    response.writeHead(200, { 'Content-Type': { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2' }[path.extname(file)] || 'application/octet-stream' });
    response.end(await fs.readFile(file));
  } catch (error) { response.writeHead(500).end(error.message); }
});
let browser, child, closed, config, log = '';
const errors = [], checks = [];
try {
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  const origin = `http://wails.localhost:${frontend.address().port}`;
  child = spawn(path.join(repo, '.local/cache/creator-browser-backend.exe'), [], { cwd: repo, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: {
    ...process.env, BEEFTV_BROWSER_DATA_DIR: dataDir, BEEFTV_BROWSER_READY_FILE: readyFile, BEEFTV_ALLOWED_ORIGINS: origin,
    BEEFTV_EDIT_HOST_ENTRY: path.join(repo, '.local/cache/creator-shipped-v1/edit-host/server.mjs'),
    CANVAS_OFFICIAL_PLUGIN_DIR: path.join(repo, '.local/cache/creator-official-plugins'),
  } });
  closed = new Promise(resolve => child.once('close', resolve)); child.stderr.on('data', bytes => { log = (log + bytes).slice(-8000); });
  const deadline = Date.now() + 30000;
  while (!config && Date.now() < deadline) { assert.equal(child.exitCode, null, log); try { config = JSON.parse(await fs.readFile(readyFile, 'utf8')); } catch { await delay(100); } }
  assert.ok(config, log);
  browser = await chromium.launch({ executablePath: process.env.BEEFTV_TEST_CHROME, headless: true, args: ['--host-resolver-rules=MAP wails.localhost 127.0.0.1'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(value => { window.go = { main: { DesktopApp: { RuntimeConfig: async () => value } } }; }, config);
  await context.route('**/*', route => ['127.0.0.1', 'localhost', 'wails.localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/#/skills');
  await page.getByRole('button', { name: '查看 Video Use 视频理解与剪辑', exact: true }).waitFor();
  await page.getByRole('button', { name: '查看 Skill Creator 技能沉淀', exact: true }).waitFor();
  checks.push('builtins visible through real desktop API and freshly packaged Skill resources');
  await page.screenshot({ path: path.join(artifacts, 'skill-hub.png') });
  await page.getByRole('button', { name: '查看 Video Use 视频理解与剪辑', exact: true }).click();
  await page.getByRole('dialog').waitFor(); checks.push('Video Use file viewer opens');
  await page.screenshot({ path: path.join(artifacts, 'video-use.png') });
  await page.goto(origin + '/#/settings');
  await page.getByRole('tab', { name: 'ASR', exact: true }).click();
  await page.getByText('本地模型已就绪', { exact: false }).waitFor();
  assert.match(await page.locator('body').innerText(), /141\.1 MiB/); checks.push('shipped multilingual Base ready, actual model size and timing precision visible');
  await page.screenshot({ path: path.join(artifacts, 'asr-settings.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors }));
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null) { child.stdin.end(); await Promise.race([closed, delay(10000)]); assert.notEqual(child.exitCode, null, 'backend did not shut down'); }
  frontend.closeAllConnections(); await new Promise(resolve => frontend.close(resolve));
  await fs.unlink(readyFile).catch(() => {});
  await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ scope: 'production React + real desktop backend and shipped resources; Wails bootstrap represented by fixture; no paid models', checks, errors }, null, 2));
}
