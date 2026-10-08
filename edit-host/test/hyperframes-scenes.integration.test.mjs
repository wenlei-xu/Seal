import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createProjectStore } from '../project-store.mjs';
import { initializeProject } from '../starter.mjs';
import { createStudioGateway } from '../studio-gateway.mjs';
import { createHypitScenes } from '../hypit-scenes.mjs';
import { createHyperframesScenes } from '../hyperframes-scenes.mjs';
import { savedExport } from '../saved-exports.mjs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { parseHTML } from 'linkedom';
const runFile = promisify(execFile);

test('native GSAP candidate: real official check and screenshots, CAS promotion, split clock, frozen export and undo', { timeout: 180000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv-hyperframes-proof-'));
  const store = createProjectStore(root);
  const edit = await store.ensure('hyperframes_proof');
  await initializeProject(store.workDir(edit.editId));
  const samples = 48000 * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 48000) * 6000), 44 + i * 2);
  await fs.writeFile(path.join(store.workDir(edit.editId), 'assets/proof-tone.wav'), wav);
  await runFile(process.env.PRODUCER_FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=1',
    '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-y', path.join(store.workDir(edit.editId), 'assets/proof-video.mp4')], { windowsHide: true });
  const gateway = createStudioGateway(store);
  const author = createHyperframesScenes(store);
  const scenes = createHypitScenes(store, gateway);
  let browser;
  t.after(async () => {
    await browser?.close();
    await author.close(); await gateway.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const input = { baseRevision: 0, duration: 2, width: 640, height: 360,
    html: '<video id="footage" class="clip" src="assets/footage.mp4" data-start="0" data-duration="2" data-track-index="2" muted playsinline width="160" height="90"></video><h1 id="title">Hello HyperFrames</h1><audio id="tone" class="clip" src="assets/tone.wav" data-start="0" data-duration="2" data-track-index="1" data-volume="0.4" data-automation="{&quot;version&quot;:1,&quot;lanes&quot;:[{&quot;target&quot;:&quot;volume&quot;,&quot;points&quot;:[{&quot;t&quot;:0,&quot;v&quot;:0},{&quot;t&quot;:0.5,&quot;v&quot;:0.4},{&quot;t&quot;:1.5,&quot;v&quot;:0.4},{&quot;t&quot;:2,&quot;v&quot;:0}]}]}"></audio>',
    assets: [{ source: 'assets/proof-tone.wav', path: 'assets/tone.wav' }, { source: 'assets/proof-video.mp4', path: 'assets/footage.mp4' }],
    css: ':root{background:#101216;color:#fff}#title{position:absolute;left:40px;top:90px;margin:0;font:700 38px sans-serif}',
    script: 'const tl=gsap.timeline({paused:true});tl.fromTo("#title",{y:30,opacity:0},{y:0,opacity:1,duration:.8},0);tl.to("#title",{x:30,duration:1.2},.8);' };
  const markup = parseHTML(`<html><body>${input.html}</body></html>`).document;
  const tone = markup.getElementById('tone');
  tone.setAttribute('data-fx-chain', JSON.stringify({ version: 1, nodes: [{ id: 'n1', type: 'gain', params: { gain: 0 } }] }));
  const automation = JSON.parse(tone.getAttribute('data-automation'));
  automation.lanes.push({ target: 'fx.n1.gain', points: [{ t: 0, v: -12 }, { t: .5, v: 0 }, { t: 1.5, v: 0 }, { t: 2, v: -12 }] });
  tone.setAttribute('data-automation', JSON.stringify(automation));
  input.html = markup.body.innerHTML;
  await assert.rejects(author.create(edit.editId, { ...input, script: 'fetch("https://example.com")' }), { reason: 'scene_api_forbidden' });
  const candidate = await author.create(edit.editId, input);
  await assert.rejects(scenes.promote(edit.editId, { candidateId: candidate.candidateId, operationId: 'unchecked' }), { reason: 'candidate_check_required' });
  const checked = await author.inspect(edit.editId, { candidateId: candidate.candidateId, command: 'check' });
  assert.equal(checked.ok, true, JSON.stringify({ report: checked.report, log: checked.log, stderr: checked.stderr }));
  assert.equal(checked.report.browserSkipped, false);
  assert.ok(checked.report.lint.filesScanned >= 2, 'The child scene must be statically linted too');
  const snapshot = await author.inspect(edit.editId, { candidateId: candidate.candidateId, command: 'snapshot' });
  assert.equal(snapshot.ok, true, snapshot.log + snapshot.stderr);
  assert.ok(snapshot.images.length >= 2);
  const owned = await gateway.open(edit.editId);
  const context = await author.context(edit.editId, gateway);
  assert.equal(context.revision, 0); assert.equal(context.clips.length, 0);
  const receipt = await scenes.promote(edit.editId, { candidateId: candidate.candidateId, operationId: 'add', start: 0 });
  assert.equal(receipt.revision, 1);
  assert.equal((await scenes.promote(edit.editId, { candidateId: candidate.candidateId, operationId: 'add', start: 0 })).replayed, true);
  await owned.history.flush();
  const entry = owned.history.list().at(-1);
  assert.equal(entry.label, 'Import HyperFrames scene');
  assert.equal(entry.who.name, 'HyperFrames');
  const undo = await store.transaction(edit.editId, { operationId: 'undo', expectedRevision: 1, requestKey: 'undo' }, async () => {
    const response = await owned.studio.app.request(`/api/projects/${edit.editId}/history/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, who: { kind: 'agent', name: 'BeefTV' } }) });
    const result = await response.json(); assert.equal(result.ok, true); return result;
  });
  assert.equal((await author.context(edit.editId, gateway)).clips.length, 0);
  await store.transaction(edit.editId, { operationId: 'redo', expectedRevision: 2, requestKey: 'redo' }, async () => {
    const response = await owned.studio.app.request(`/api/projects/${edit.editId}/history/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: undo.result.entry.id, who: { kind: 'agent', name: 'BeefTV' } }) });
    assert.equal((await response.json()).ok, true);
  });
  assert.equal((await author.context(edit.editId, gateway)).clips.length, 1);
  const split = await store.transaction(edit.editId, { operationId: 'split', expectedRevision: 3, requestKey: 'split' }, async () => {
    const window = await owned.history.beginWindow({ kind: 'person', name: 'You' }, 'Split title');
    try {
      const response = await owned.studio.app.request(`/api/projects/${edit.editId}/file-mutations/split-element/index.html`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: { id: candidate.sceneId }, splitTime: 1, newId: 'title_second' }) });
      assert.equal(response.status, 200); return response.json();
    } finally { await window.close(); }
  });
  assert.equal(split.revision, 4);
  browser = await puppeteer.launch({ executablePath: process.env.HYPERFRAMES_BROWSER_PATH, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const { ticket } = owned.ticket('http://127.0.0.1:5173');
  const launch = await fetch(`${owned.origin}/__session`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' }, body: new URLSearchParams({ ticket }), redirect: 'manual' });
  const [cookieName, cookieValue] = launch.headers.get('set-cookie').split(';')[0].split('=');
  await page.setCookie({ name: cookieName, value: cookieValue, url: owned.origin });
  await page.goto(`${owned.origin}/api/projects/${edit.editId}/preview`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__player?.renderSeek && document.getElementById('title_second')?.querySelector('audio'));
  const live = await page.evaluate(sceneId => {
    const volume = (time, mount) => { window.__player.renderSeek(time); return document.getElementById(mount).querySelector('audio').volume; };
    return [volume(.1, sceneId), volume(1.1, 'title_second'), volume(1.8, 'title_second')];
  }, candidate.sceneId);
  for (const [index, expected] of [.08, .4, .16].entries()) assert.ok(Math.abs(live[index] - expected) < .003, 'Live preview must use the original fade clock: ' + JSON.stringify(live));
  await assert.rejects(scenes.promote(edit.editId, { candidateId: candidate.candidateId, operationId: 'stale' }), { reason: 'revision_conflict' });
  const exported = await owned.render({ operationId: 'render', expectedRevision: 4, fps: 30, quality: 'draft' });
  const exportId = exported.result.exportId;
  await store.transaction(edit.editId, { operationId: 'post_export_change', expectedRevision: 4, requestKey: 'post_export_change' }, async dir => {
    await fs.writeFile(path.join(dir, 'notes.txt'), 'Manual edit after frozen export');
  });
  let output;
  for (let i = 0; i < 90; i++) {
    output = await savedExport(store, edit.editId, exportId);
    if (['complete', 'failed', 'cancelled'].includes(output.summary.status)) break;
    await delay(500);
  }
  const status = await fs.readFile(path.join(store.editDir(edit.editId), 'exports', exportId, 'status.json'), 'utf8');
  assert.equal(output.summary.status, 'complete', status);
  assert.equal(output.summary.inputRevision, 4);
  assert.ok((await fs.stat(output.file)).size > 1000);
  const { stdout: probe } = await runFile(process.env.PRODUCER_FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', output.file], { windowsHide: true });
  assert.ok(JSON.parse(probe).streams.some(stream => stream.codec_type === 'audio'), 'Candidate audio must reach the frozen export');
  const { stdout: pcm } = await runFile(process.env.PRODUCER_FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', output.file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, encoding: 'buffer' });
  const rms = time => {
    let sum = 0, count = 0;
    for (let i = Math.round(time * 48000); i < Math.round((time + .08) * 48000) && i * 4 + 4 <= pcm.length; i++) { sum += pcm.readFloatLE(i * 4) ** 2; count++; }
    return Math.sqrt(sum / count);
  };
  const levels = [.08, .6, 1.1, 1.82].map(rms);
  assert.ok(levels[1] > levels[0] * 2 && levels[2] > levels[0] * 2 && levels[3] < levels[2] * .6,
    `Split audio must retain the original fade clock: ${JSON.stringify(levels)}`);
  assert.ok(levels[2] / levels[1] > .8 && levels[2] / levels[1] < 1.2, 'FX automation must retain the original source clock: ' + JSON.stringify(levels));
  const pixel = async time => (await runFile(process.env.PRODUCER_FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-ss', String(time), '-i', output.file,
    '-vf', 'format=rgb24,crop=1:1:50:20', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true, encoding: 'buffer' })).stdout;
  const firstPixel = await pixel(.5), secondPixel = await pixel(1.5);
  assert.ok(firstPixel[0] > 180 && firstPixel[2] < 60, 'First half must show the red source frame');
  assert.ok(secondPixel[2] > 180 && secondPixel[0] < 60, 'Split video must use its blue source frame, not replay its opening');
  if (process.env.BEEFTV_HYPERFRAMES_PROOF_DIR) {
    const proof = path.resolve(process.env.BEEFTV_HYPERFRAMES_PROOF_DIR);
    await fs.mkdir(proof, { recursive: true });
    await fs.copyFile(output.file, path.join(proof, 'title-split.mp4'));
    await fs.writeFile(path.join(proof, 'title.png'), Buffer.from(snapshot.images[2]?.data || snapshot.images[0].data, 'base64'));
    await fs.writeFile(path.join(proof, 'check.json'), JSON.stringify({ ...checked, images: checked.images.map(image => ({ file: image.file })) }, null, 2));
  }
  await store.transaction(edit.editId, { operationId: 'undo_agent', expectedRevision: 5, requestKey: 'undo_agent' }, async () => {
    const response = await owned.studio.app.request(`/api/projects/${edit.editId}/history/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, who: { kind: 'agent', name: 'BeefTV' } }) });
    const result = await response.json();
    // Later manual split is allowed to conflict; it must never be silently discarded.
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.ok(result.conflict.files.includes('index.html'));
  });
  assert.equal(await fs.readFile(path.join(store.workDir(edit.editId), 'notes.txt'), 'utf8'), 'Manual edit after frozen export');
});
