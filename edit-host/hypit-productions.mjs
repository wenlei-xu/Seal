import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { failure, sourcePath, safeId, atomicJson, assertPlainTree } from './project-store.mjs';
import { hypitDistribution } from '../agent-host/hypit-distribution.mjs';
import { createHypitInputs, hashFile } from './hypit-inputs.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const worker = fileURLToPath(new URL('./hypit-production-worker.mjs', import.meta.url));
const reserved = file => /(^|\/)(node_modules|\.git|\.hypit)(\/|$)/.test(file)
  || /(^|\/)hypit\.(runtime|results)\.json$/.test(file);
const environment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|LOCALAPPDATA|APPDATA|COMSPEC)$/i.test(key)
  || /^(HYPERFRAMES_BROWSER_PATH|PRODUCER_HEADLESS_SHELL_PATH|PRODUCER_FFMPEG_PATH|PRODUCER_FFPROBE_PATH)$/.test(key)));

export function createHypitProductions(store, scenes) {
  const running = new Map();
  const root = editId => path.join(store.editDir(editId), 'hypit');
  const workspace = editId => path.join(root(editId), 'project');
  const media = createHypitInputs(store, workspace);
  const jobDir = (editId, jobId) => path.join(root(editId), 'jobs', safeId(jobId));
  const distribution = () => {
    const value = hypitDistribution();
    if (!value) throw failure('hypit_unavailable', 'Hypit distribution is not installed', 503);
    return value;
  };
  async function initialize(editId) {
    await fs.mkdir(workspace(editId), { recursive: true });
    await fs.writeFile(path.join(workspace(editId), 'package.json'), JSON.stringify({ name: 'beeftv-hypit-project', private: true, type: 'module' }), { flag: 'wx' })
      .catch(error => { if (error.code !== 'EEXIST') throw error; });
  }
  async function files(dir, prefix = '') {
    await assertPlainTree(dir);
    const result = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = prefix + entry.name;
      if (reserved(file)) continue;
      if (entry.isDirectory()) result.push(...await files(path.join(dir, entry.name), file + '/'));
      else result.push({ file, sha256: await hashFile(path.join(dir, entry.name)) });
    }
    return result;
  }
  async function open(editId) {
    await initialize(editId);
    return { editId, ...(await store.state(editId)), hypitVersion: hypitDistribution()?.version || null, files: await files(workspace(editId)), inputs: await media.list(editId) };
  }
  async function read(editId, input) {
    const area = input.area || 'project';
    const dir = area === 'skill' ? distribution().skillRoot : workspace(editId);
    const name = area === 'skill' && path.isAbsolute(input.file) ? path.relative(dir, input.file).replaceAll('\\', '/') : input.file;
    if (area !== 'skill' && area !== 'project') throw failure('invalid_read_area', 'Read a skill reference or production source');
    if (reserved(name) || (area === 'skill' ? !name.endsWith('.md') : !/\.(svml|svs|svrun|ts|js|mjs|json|md)$/.test(name))) throw failure('source_unavailable', 'This file is not an authoring reference');
    await assertPlainTree(dir);
    const target = sourcePath(dir, name);
    const info = await fs.stat(target);
    if (info.size > 256 * 1024) throw failure('source_too_large', 'Read a smaller source file');
    const bytes = await fs.readFile(target);
    return { file: name, area, content: bytes.toString('utf8'), sha256: sha(bytes) };
  }
  async function write(editId, input) {
    safeId(input.operationId);
    await initialize(editId);
    const file = sourcePath(workspace(editId), input.file);
    if (reserved(input.file) || !/\.(svml|svs|svrun|ts|js|mjs|json|md)$/.test(input.file) || typeof input.text !== 'string' || Buffer.byteLength(input.text) > 256 * 1024) {
      throw failure('invalid_source', 'Write an authoring source, component or project note');
    }
    if (input.file.endsWith('package.json')) {
      const value = JSON.parse(input.text);
      if (value.scripts || value.dependencies || value.devDependencies) throw failure('package_install_forbidden', 'Author packages use the installed distribution; package installation is not a model tool');
    }
    return store.locked(editId, async () => {
      await assertPlainTree(workspace(editId));
      const receipts = path.join(root(editId), 'writes', `${input.operationId}.json`);
      const key = sha(JSON.stringify(input));
      let previous;
      try {
        previous = JSON.parse(await fs.readFile(receipts, 'utf8'));
        if (previous.key !== key) throw failure('operation_reused', 'Source operation was reused', 409);
        if (previous.state !== 'pending') return { ...previous.result, replayed: true };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      let current = null;
      try { current = sha(await fs.readFile(file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (previous && current === previous.result.sha256) {
        await atomicJson(receipts, { key, state: 'complete', result: previous.result });
        return { ...previous.result, replayed: true };
      }
      if (input.expectedHash !== current) throw failure('source_conflict', 'Production source changed; read it before writing', 409);
      const result = { file: input.file, sha256: sha(input.text) };
      await atomicJson(receipts, { key, state: 'pending', result });
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, input.text, { flag: 'wx' });
      try { await fs.rename(temporary, file); }
      finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      await atomicJson(receipts, { key, state: 'complete', result });
      return result;
    });
  }
  async function status(editId, jobId) {
    const state = JSON.parse(await fs.readFile(path.join(jobDir(editId, jobId), 'state.json'), 'utf8'));
    if (state.editId !== editId) throw failure('job_scope_mismatch', 'Production belongs to another edit', 403);
    if (state.status === 'running' && !running.has(`${editId}:${jobId}`)) {
      state.status = 'interrupted'; state.error = 'Runtime restarted; frozen inputs and Hypit results are preserved';
      await atomicJson(path.join(jobDir(editId, jobId), 'state.json'), state);
    }
    return state;
  }
  async function list(editId) {
    const names = await fs.readdir(path.join(root(editId), 'jobs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const result = [];
    for (const name of names) if (/^job_[a-zA-Z0-9_-]+$/.test(name)) {
      try { result.push(await status(editId, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function start(editId, input) {
    const installed = distribution();
    safeId(input.operationId);
    if (!['check', 'plan', 'build'].includes(input.command)) throw failure('command_forbidden', 'Use an official check, plan or build command');
    if (typeof input.source !== 'string' || !input.source.endsWith('.svrun')) throw failure('run_required', 'Production commands require an explicit SVRun target');
    const outputs = { composition: input.compositionOutput || 'main.composition', timeline: input.timelineOutput || 'animation.timeline' };
    const jobId = `job_${sha(input.operationId).slice(0, 32)}`;
    const directory = jobDir(editId, jobId);
    return store.locked(editId, async () => {
      const key = sha(JSON.stringify(input));
      try {
        const previous = await status(editId, jobId);
        if (previous.requestKey !== key) throw failure('operation_reused', 'Production operation was reused', 409);
        return previous;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const state = await store.state(editId);
      if (state.revision !== input.expectedRevision) throw failure('revision_conflict', 'The edit changed before production started', 409);
      await initialize(editId);
      const inputs = await files(workspace(editId));
      if (!inputs.some(item => item.file === input.source)) throw failure('source_missing', 'Read and write the SVRun before starting production');
      const project = path.join(directory, 'project');
      for (const item of inputs) {
        const target = sourcePath(project, item.file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(sourcePath(workspace(editId), item.file), target);
        if (await hashFile(target) !== item.sha256) throw failure('source_conflict', 'Source changed while freezing production inputs', 409);
      }
      // Register authored local packages in the frozen project's ordinary
      // package layout, without npm, install scripts, symlinks or mutable links.
      for (const item of inputs.filter(item => /^packages\/[^/]+\/package\.json$/.test(item.file))) {
        const localRoot = path.dirname(sourcePath(project, item.file));
        const packageInfo = JSON.parse(await fs.readFile(path.join(localRoot, 'package.json'), 'utf8'));
        if (!/^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(packageInfo.name) || packageInfo.name.startsWith('@hypit/')) throw failure('invalid_author_package', 'Author packages need their own package name');
        const target = sourcePath(project, `node_modules/${packageInfo.name}`);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.cp(localRoot, target, { recursive: true, errorOnExist: true, force: false });
      }
      // The executable's hosted default is never selected implicitly. Generated
      // media enters through Seal's existing approved task and asset flow.
      const mediaConfig = { ...(process.env.PRODUCER_FFMPEG_PATH ? { ffmpegPath: process.env.PRODUCER_FFMPEG_PATH } : {}),
        ...(process.env.PRODUCER_FFPROBE_PATH ? { ffprobePath: process.env.PRODUCER_FFPROBE_PATH } : {}) };
      const browserPath = process.env.HYPERFRAMES_BROWSER_PATH || process.env.PRODUCER_HEADLESS_SHELL_PATH;
      await atomicJson(path.join(project, 'hypit.runtime.json'), { format: 'hypit.runtime-local@1', dataRoot: '.hypit/runtime', credentials: {}, endpoints: {
        'media.local': { use: '@hypit/provider-media-local', config: mediaConfig },
        'hyperframes.local': { use: '@hypit/provider-hyperframes-local', config: { ...mediaConfig, nodePath: process.execPath,
          ...(browserPath ? { chromePath: browserPath } : {}) } },
      } });
      const record = { jobId, editId, projectId: state.projectId, requestKey: key, status: 'running', command: input.command, source: input.source,
        baseRevision: state.revision, inputs, outputs, hypitVersion: installed.version, createdAt: new Date().toISOString(), progress: '' };
      const file = path.join(directory, 'state.json');
      await atomicJson(file, record);
      const child = fork(worker, [], { cwd: project, env: environment(), execArgv: [], silent: true, windowsHide: true });
      child.stdout.on('data', () => {});
      child.stderr.on('data', () => {});
      let writes = Promise.resolve();
      const persist = () => { const snapshot = structuredClone(record); writes = writes.then(() => atomicJson(file, snapshot)); writes.catch(() => child.kill()); };
      const activeKey = `${editId}:${jobId}`;
      const done = new Promise(resolve => {
        child.on('message', message => {
          if (message.type === 'progress') record.progress = message.text;
          else if (message.type === 'done') { record.status = 'complete'; record.report = message.report; }
          else if (message.type === 'failed') { record.status = message.cancelled ? 'cancelled' : 'failed'; record.error = message.error; }
          persist();
        });
        child.once('error', error => { record.status = 'failed'; record.error = error.message; persist(); });
        child.once('close', async code => {
          if (record.status === 'running') { record.status = 'failed'; record.error = `Production worker stopped (${code})`; persist(); }
          try { await writes; } finally { running.delete(activeKey); resolve(); }
        });
      });
      const handle = { child, done, cancel: () => { if (child.connected) child.send({ type: 'cancel' }); } };
      running.set(activeKey, handle);
      child.send({ type: 'start', distribution: installed, project, command: input.command, source: input.source, outputs, inputs });
      return record;
    });
  }
  async function cancel(editId, jobId) { running.get(`${editId}:${safeId(jobId)}`)?.cancel(); return status(editId, jobId); }
  async function publish(editId, input) {
    const job = await status(editId, input.jobId);
    if (job.status !== 'complete' || job.command !== 'build') throw failure('production_not_ready', 'Only a completed Hypit build can produce a scene', 409);
    const file = path.join(jobDir(editId, input.jobId), 'bundle.json');
    const bytes = await fs.readFile(file, 'utf8');
    if (sha(bytes) !== job.report?.bundleHash) throw failure('production_changed', 'Production bundle was modified after completion', 409);
    const bundle = JSON.parse(bytes);
    return store.locked(editId, async () => {
      const manifest = path.join(jobDir(editId, input.jobId), 'candidate.json');
      try { return JSON.parse(await fs.readFile(manifest, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const candidate = await scenes.create(editId, { ...bundle, baseRevision: job.baseRevision });
      await atomicJson(manifest, candidate); return candidate;
    });
  }
  async function close() { for (const handle of running.values()) handle.cancel(); await Promise.all([...running.values()].map(handle => handle.done)); }
  async function importAsset(editId, input, stream) { await initialize(editId); return media.importMedia(editId, input, stream); }
  return { open, read, write, start, status, list, cancel, publish, close, importAsset, frames: media.frames, busy: () => running.size };
}
