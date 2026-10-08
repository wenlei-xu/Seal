import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { configureBundledRuntime } from '../bundled-runtime.mjs';

test('bundled dependency selection rejects changed files, path escapes and another target before setting environment', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'beeftv runtime selection '));
  const names = ['HYPERFRAMES_BROWSER_PATH', 'PRODUCER_HEADLESS_SHELL_PATH', 'PRODUCER_FFMPEG_PATH', 'PRODUCER_FFPROBE_PATH', 'PATH'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(async () => { for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; } await fs.rm(directory, { recursive: true, force: true }); });
  const manifest = { format: 'beeftv.edit-runtime@1', platform: process.platform, arch: process.arch, nodeVersion: process.versions.node, hyperframesVersion: '0.8.130', hypitVersion: '0.2.17' };
  for (const name of ['browser', 'ffmpeg', 'ffprobe']) {
    await fs.writeFile(path.join(directory, name), name);
    manifest[name] = { file: name, sha256: crypto.createHash('sha256').update(name).digest('hex') };
  }
  const save = () => fs.writeFile(path.join(directory, 'runtime-manifest.json'), JSON.stringify(manifest));
  await fs.appendFile(path.join(directory, 'ffprobe'), 'altered'); await save();
  assert.throws(() => configureBundledRuntime(directory), /was changed: ffprobe/);
  assert.deepEqual(Object.fromEntries(names.map(name => [name, process.env[name]])), before);
  await fs.writeFile(path.join(directory, 'ffprobe'), 'ffprobe');
  manifest.browser.file = '../outside'; await save();
  assert.throws(() => configureBundledRuntime(directory), /path/i);
  manifest.browser.file = 'browser'; manifest.arch = 'other'; await save();
  assert.throws(() => configureBundledRuntime(directory), /target or version mismatch/);
  manifest.arch = process.arch; await save(); configureBundledRuntime(directory);
  assert.equal(process.env.HYPERFRAMES_BROWSER_PATH, path.join(directory, 'browser'));
  assert.equal(process.env.PRODUCER_FFMPEG_PATH, path.join(directory, 'ffmpeg'));
  assert.equal(process.env.PRODUCER_FFPROBE_PATH, path.join(directory, 'ffprobe'));
  assert.equal(process.env.PATH.split(path.delimiter)[0], directory);
});
