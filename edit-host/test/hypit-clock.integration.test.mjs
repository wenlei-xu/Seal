import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseHTML } from 'linkedom';
import { createProjectStore } from '../project-store.mjs';
import { createStudioGateway } from '../studio-gateway.mjs';
import { createHypitScenes } from '../hypit-scenes.mjs';
import { initializeProject } from '../starter.mjs';
import { compileHypitBundle } from '../scripts/hypit-fixture.mjs';
import { savedExport, listSavedExports } from '../saved-exports.mjs';
import { createLibraryMedia } from '../library-media.mjs';
import { createReadStream } from 'node:fs';

const hypitRoot = process.env.BEEFTV_TEST_HYPIT_ROOT;
const chrome = process.env.BEEFTV_TEST_CHROME;
const runFile = promisify(execFile);

test('real Hypit frame programs keep their source clock after native Studio split/move/undo/reopen', { skip: !hypitRoot || !chrome }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-clock-test-'));
  const store = createProjectStore(root);
  const edit = await store.ensure('clock_test');
  await initializeProject(store.workDir(edit.editId));
  let gateway = createStudioGateway(store);
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  t.after(async () => { await browser.close(); await gateway.close(); await fs.rm(root, { recursive: true, force: true }); });
  const scenes = createHypitScenes(store, gateway);
  const rich = process.env.BEEFTV_TEST_RICH === '1';
  const bundle = await compileHypitBundle(hypitRoot, { rich });
  const candidate = await scenes.create(edit.editId, { baseRevision: 0, ...bundle });
  await scenes.promote(edit.editId, { candidateId: candidate.candidateId, operationId: 'import' });
  let owned = await gateway.open(edit.editId);

  async function native(operationId, route, payload) {
    return store.transaction(edit.editId, { operationId, expectedRevision: (await store.state(edit.editId)).revision, requestKey: operationId }, async () => {
      const window = route.startsWith('history/') ? null : await owned.history.beginWindow({ kind: 'person', name: 'You' }, operationId);
      try {
        const response = await owned.studio.app.request(`/api/projects/${edit.editId}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        assert.equal(response.ok, true, JSON.stringify(result));
        assert.equal(result.ok, true);
        return result;
      } finally { await window?.close(); }
    });
  }
  const sceneFile = `scenes/${candidate.sceneId}/scene.html`;
  const titleId = parseHTML(await fs.readFile(path.join(store.workDir(edit.editId), sceneFile), 'utf8')).document.querySelector('template').content.querySelector('.headline').getAttribute('data-hf-id');
  await native('edit_title', `file-mutations/patch-element/${sceneFile}`, { target: { hfId: titleId }, operations: [{ type: 'text-content', property: 'textContent', value: 'My cut' }] });
  await native('split', 'file-mutations/split-element/index.html', { target: { id: candidate.sceneId }, splitTime: 1.25, newId: 'second' });
  await native('move', 'file-mutations/patch-element/index.html', { target: { id: 'second' }, operations: [{ type: 'attribute', property: 'data-start', value: '2' }] });
  await native('extend', 'file-mutations/patch-element/index.html', { target: { id: 'main' }, operations: [{ type: 'attribute', property: 'data-duration', value: '3.75' }] });
  const source = await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8');
  assert.match(source, /data-playback-start="1.25"/);
  await gateway.close();
  gateway = createStudioGateway(createProjectStore(root));
  owned = await gateway.open(edit.editId);

  const { ticket } = owned.ticket('http://127.0.0.1:5173');
  const launch = await fetch(`${owned.origin}/__session`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' }, body: new URLSearchParams({ ticket }), redirect: 'manual' });
  const [name, value] = launch.headers.get('set-cookie').split(';')[0].split('=');
  const page = await browser.newPage();
  await page.setCookie({ name, value, url: owned.origin });
  const beforePreview = await store.snapshot(edit.editId);
  await page.goto(`${owned.origin}/api/projects/${edit.editId}/preview`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__player?.renderSeek && document.querySelector('[data-observed-frame]'));
  async function observed(time, id) {
    return page.evaluate(({ time, id }) => {
      window.__player.renderSeek(time);
      const mount = document.getElementById(id);
      if (!mount?.querySelector('[data-observed-frame]')) return { missing: true, html: mount?.outerHTML?.slice(0, 5000), timelines: Object.keys(window.__timelines || {}), observed: [...document.querySelectorAll('[data-observed-frame]')].map(node => ({ id: node.id, frame: node.dataset.observedFrame })) };
      return { frame: Number(mount.querySelector('[data-observed-frame]').dataset.observedFrame),
        color: getComputedStyle(mount.querySelector('.headline')).color, title: mount.querySelector('.headline').textContent };
    }, { time, id });
  }
  assert.deepEqual(await observed(2.5, 'second'), { frame: 42, color: 'rgb(255, 255, 255)', title: 'My cut' });
  assert.equal((await observed(0.5, candidate.sceneId)).frame, 12);
  assert.equal((await observed(2.5, 'second')).frame, 42);
  if (rich) {
    await page.evaluate(() => document.fonts.ready);
    const opacity = async (time, id) => page.evaluate(({ time, id }) => {
      window.__player.renderSeek(time);
      return Number(getComputedStyle(document.getElementById(id).querySelector('[data-hypit-text-unit-grapheme]')).opacity);
    }, { time, id });
    assert.equal(await opacity(2.5, 'second'), 1);
    assert.ok(Math.abs(await opacity(0.5, candidate.sceneId) - 0.5) < 0.01);
    assert.equal(await opacity(2.5, 'second'), 1);
  }
  await owned.history.flush();
  assert.deepEqual(owned.history.list().map(entry => entry.label), ['Import Hypit scene', 'edit_title', 'split', 'move', 'extend']);
  assert.deepEqual(await store.snapshot(edit.editId), beforePreview, 'Preview and seeks must not change persisted source');
  if (process.env.BEEFTV_TEST_RENDER === '1') {
    process.env.HYPERFRAMES_BROWSER_PATH = chrome;
    process.env.PRODUCER_HEADLESS_SHELL_PATH = chrome;
    const revision = (await store.state(edit.editId)).revision;
    const exporting = await fetch(`${owned.origin}/api/projects/${edit.editId}/render`, {
      method: 'POST', headers: { Cookie: `${name}=${value}`, Origin: owned.origin, 'Content-Type': 'application/json',
        'X-Beeftv-Edit-Revision': String(revision), 'X-Beeftv-Operation': 'export' },
      body: JSON.stringify({ fps: 30, quality: 'draft', format: 'mp4', telemetryOptOut: true }),
    });
    assert.equal(exporting.status, 200, await exporting.clone().text());
    const render = await exporting.json();
    assert.equal(render.inputRevision, revision);
    const frozenDir = path.join(store.editDir(edit.editId), 'exports', render.exportId);
    const input = JSON.parse(await fs.readFile(path.join(frozenDir, 'input.json'), 'utf8'));
    assert.equal(input.revision, revision);
    await native('shorten_during_export', 'file-mutations/patch-element/index.html', { target: { id: 'main' }, operations: [{ type: 'attribute', property: 'data-duration', value: '1' }] });
    assert.match(await fs.readFile(path.join(frozenDir, 'project', 'index.html'), 'utf8'), /data-duration="3.75"/);
    const progress = await fetch(`${owned.origin}/api/render/${render.jobId}/progress`, { headers: { Cookie: `${name}=${value}` }, signal: AbortSignal.timeout(180_000) });
    assert.equal(progress.ok, true);
    const events = await progress.text();
    assert.match(events, /"status":"complete"/, events);
    const output = path.join(frozenDir, 'output.mp4');
    const saved = await savedExport(store, edit.editId, render.exportId);
    assert.equal(saved.file, output);
    const durableStatus = JSON.parse(await fs.readFile(path.join(frozenDir, 'status.json'), 'utf8'));
    assert.equal(durableStatus.status, 'complete');
    assert.ok((await listSavedExports(store, edit.editId)).some(item => item.exportId === render.exportId && item.status === 'complete'));
    const { stdout: probe } = await runFile('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]);
    const metadata = JSON.parse(probe);
    const video = metadata.streams.find(stream => stream.codec_type === 'video');
    assert.equal(video.width, 320);
    assert.equal(video.height, 480);
    assert.equal(video.avg_frame_rate, '30/1');
    assert.equal(Number(video.nb_frames), 113);
    const libraryEdit = await store.ensure('library_roundtrip');
    await initializeProject(store.workDir(libraryEdit.editId));
    const library = createLibraryMedia(store, gateway);
    const imported = await library.importMedia(libraryEdit.editId, { assetId: 'exported-video', resourceId: 'saved-video-resource', title: '成片素材',
      kind: 'video', mimeType: 'video/mp4', size: (await fs.stat(output)).size, width: 320, height: 480,
      durationMs: 3750, operationId: 'import_video', expectedRevision: 0 }, createReadStream(output));
    assert.equal(imported.revision, 1);
    const libraryStudio = await gateway.open(libraryEdit.editId);
    const libraryTicket = libraryStudio.ticket('http://127.0.0.1:5173').ticket;
    const libraryLaunch = await fetch(`${libraryStudio.origin}/__session`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' },
      body: new URLSearchParams({ ticket: libraryTicket }), redirect: 'manual' });
    const libraryCookie = libraryLaunch.headers.get('set-cookie').split(';')[0];
    const [libraryName, libraryValue] = libraryCookie.split('=');
    await page.setCookie({ name: libraryName, value: libraryValue, url: libraryStudio.origin });
    await page.goto(`${libraryStudio.origin}/api/projects/${libraryEdit.editId}/preview`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__player?.renderSeek && document.querySelector('video')?.readyState >= 2);
    await page.evaluate(() => window.__player.renderSeek(2.5));
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 2.5) < 0.05);
    assert.equal(await page.evaluate(() => document.querySelector('video').getAttribute('data-beeftv-asset-id')), 'exported-video');
    const libraryRendering = await fetch(`${libraryStudio.origin}/api/projects/${libraryEdit.editId}/render`, { method: 'POST',
      headers: { Cookie: libraryCookie, Origin: libraryStudio.origin, 'Content-Type': 'application/json', 'X-Beeftv-Edit-Revision': '1', 'X-Beeftv-Operation': 'render_library_video' },
      body: JSON.stringify({ fps: 30, quality: 'draft', format: 'mp4', telemetryOptOut: true }) });
    assert.equal(libraryRendering.status, 200, await libraryRendering.clone().text());
    const libraryRender = await libraryRendering.json();
    const libraryProgress = await fetch(`${libraryStudio.origin}/api/render/${libraryRender.jobId}/progress`, { headers: { Cookie: libraryCookie }, signal: AbortSignal.timeout(180_000) });
    assert.match(await libraryProgress.text(), /"status":"complete"/);
    const libraryOutput = (await savedExport(store, libraryEdit.editId, libraryRender.exportId)).file;
    const { stdout: libraryProbe } = await runFile('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', libraryOutput]);
    const libraryStreams = JSON.parse(libraryProbe).streams;
    assert.equal(Number(libraryStreams.find(stream => stream.codec_type === 'video').nb_frames), 113);
    if (rich) assert.ok(libraryStreams.some(stream => stream.codec_type === 'audio'), 'Library video import lost its embedded audio');
    let audioAudit;
    if (rich) {
      assert.ok(metadata.streams.some(stream => stream.codec_type === 'audio'));
      const { stdout: sound } = await runFile('ffmpeg', ['-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
      const rms = time => {
        const first = Math.round(time * 48000);
        let sum = 0;
        for (let i = first; i < first + 4800; i++) sum += sound.readFloatLE(i * 4) ** 2;
        return Math.sqrt(sum / 4800);
      };
      audioAudit = { first: rms(0.5), gap: rms(1.5), moved: rms(2.5) };
      assert.ok(audioAudit.first > 0.05, 'First split lost its audio');
      assert.ok(audioAudit.gap < 0.005, 'Moved clip gap must be silent');
      assert.ok(audioAudit.moved > 0.05, 'Moved split lost its source audio');
    }
    const { stdout: pixels } = await runFile('ffmpeg', ['-v', 'error', '-ss', '2.5', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
    const mint = [...pixels.subarray((212 * 320 + 156) * 3, (212 * 320 + 156) * 3 + 3)];
    let area = 0, sumX = 0, sumY = 0;
    for (let y = 0; y < 480; y++) for (let x = 0; x < 320; x++) {
      const offset = (y * 320 + x) * 3;
      const [r, g, b] = pixels.subarray(offset, offset + 3);
      if (g > 180 && g > r + 50 && g > b + 10) { area++; sumX += x; sumY += y; }
    }
    const marker = { x: sumX / area, y: sumY / area, area };
    assert.ok(area > 3000 && area < 4500 && Math.abs(marker.x - 155.5) < 1.5 && Math.abs(marker.y - 211.5) < 1.5,
      `Wrong source-clock pose in export: ${JSON.stringify(marker)}`);
    if (process.env.BEEFTV_TEST_ARTIFACT_DIR) {
      const artifacts = path.resolve(process.env.BEEFTV_TEST_ARTIFACT_DIR);
      await fs.mkdir(artifacts, { recursive: true });
      await fs.copyFile(output, path.join(artifacts, 'hypit-split-move.mp4'));
      await fs.copyFile(path.join(frozenDir, 'input.json'), path.join(artifacts, 'export-input.json'));
      await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ inputRevision: revision, width: video.width, height: video.height, fps: video.avg_frame_rate, frames: video.nb_frames, sourceFrameAt2_5: 42, markerPixel: mint, marker, title: 'My cut', richTypography: rich, audioRms: audioAudit }, null, 2));
    }
    await native('undo_post_export', 'history/step', { direction: 'back' });
  }
  await native('undo_extend', 'history/step', { direction: 'back' });
  await native('undo_move', 'history/step', { direction: 'back' });
  assert.match(await fs.readFile(path.join(store.workDir(edit.editId), 'index.html'), 'utf8'), /id="second"[^>]*data-start="1.25"|data-start="1.25"[^>]*id="second"/);
  assert.match(await fs.readFile(path.join(store.workDir(edit.editId), sceneFile), 'utf8'), /My cut/);
  const immutable = JSON.parse(await fs.readFile(path.join(store.editDir(edit.editId), 'candidates', candidate.candidateId, 'source.json'), 'utf8'));
  assert.ok(immutable.document.html.includes('Hypit scene'));
  assert.ok(!immutable.document.html.includes('My cut'));
});
