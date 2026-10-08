import path from 'node:path';
import { openStudio } from './hyperframes.mjs';

let studio;
let state;
let timer;
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  state?.cancel?.();
  if (studio) { studio.watcher.close(); await studio.shutdown(); }
  process.exit(code);
}
const report = () => {
  const { progress, status, stage, error, audioLoweredDb } = state;
  process.send?.({ type: 'progress', state: { progress, status, stage, error, audioLoweredDb } });
};
process.on('message', message => {
  if (message?.type === 'cancel') { void shutdown(); return; }
  if (message?.type !== 'render' || studio || closing) return;
  try {
    studio = openStudio(message.projectDir, message.options.project.id, path.join(path.dirname(message.projectDir), 'history'));
    state = studio.adapter.startRender(message.options);
    timer = setInterval(() => {
      report();
      if (state.status !== 'rendering') void shutdown(state.status === 'complete' ? 0 : 1);
    }, 250);
    report();
  } catch (error) {
    process.send?.({ type: 'progress', state: { status: 'failed', progress: 0, error: error.message } });
    void shutdown(1);
  }
});
process.once('disconnect', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
