import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson } from './project-store.mjs';

const workerFile = fileURLToPath(new URL('./render-worker.mjs', import.meta.url));
const workerEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|LOCALAPPDATA|APPDATA|COMSPEC)$/i.test(key)
  || /^(HYPERFRAMES_BROWSER_PATH|PRODUCER_HEADLESS_SHELL_PATH|PRODUCER_FFMPEG_PATH|PRODUCER_FFPROBE_PATH)$/.test(key)));

export function createRenderWorkers() {
  const running = new Set();
  function start(frozen, options) {
    options = { ...options, outputPath: path.join(frozen.directory, `output${path.extname(options.outputPath) || '.mp4'}`) };
    const state = { id: options.jobId, status: 'rendering', progress: 0, outputPath: options.outputPath };
    const child = fork(workerFile, [], { cwd: frozen.projectDir, env: workerEnvironment(), execArgv: [], silent: true, windowsHide: true });
    let log = '';
    let writes = Promise.resolve();
    const record = () => {
      const value = { jobId: state.id, exportId: frozen.manifest.exportId, inputRevision: frozen.manifest.revision,
        status: state.status, progress: state.progress, stage: state.stage, error: state.error };
      writes = writes.then(() => atomicJson(path.join(frozen.directory, 'status.json'), value));
      // Persistence failure is observable, rather than silently claiming a durable job.
      writes = writes.catch(error => { state.status = 'failed'; state.error = `Render status could not be saved: ${error.message}`; if (child.connected) child.send({ type: 'cancel' }); });
    };
    child.stdout.on('data', bytes => { log = (log + bytes).slice(-8192); });
    child.stderr.on('data', bytes => { log = (log + bytes).slice(-8192); });
    const done = new Promise(resolve => {
      child.once('error', error => { state.status = 'failed'; state.error = error.message; record(); });
      child.on('message', message => {
        if (message?.type !== 'progress') return;
        if (state.status === 'cancelled') return;
        Object.assign(state, message.state);
        record();
      });
      child.once('close', async code => {
        if (state.status === 'rendering') {
          state.status = 'failed'; state.error = `Render worker exited (${code}): ${log}`; record();
        }
        await writes;
        running.delete(handle);
        resolve();
      });
    });
    const handle = { child, done, cancel() {
      if (state.status !== 'rendering') return;
      state.status = 'cancelled'; record();
      if (child.connected) child.send({ type: 'cancel' });
    } };
    running.add(handle);
    state.cancel = () => handle.cancel();
    child.send({ type: 'render', projectDir: frozen.projectDir, options: { ...options,
      project: { ...options.project, dir: frozen.projectDir }, distinctId: undefined, telemetryOptOut: true } });
    record();
    return state;
  }
  async function close() {
    for (const handle of running) handle.cancel();
    await Promise.all([...running].map(handle => handle.done));
  }
  return { start, close, busy: () => running.size };
}
