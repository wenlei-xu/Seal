import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sourcePath } from './project-store.mjs';

export function configureBundledRuntime(root = path.dirname(fileURLToPath(import.meta.url))) {
  const file = path.join(root, 'runtime-manifest.json');
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.format !== 'beeftv.edit-runtime@1' || manifest.platform !== process.platform || manifest.arch !== process.arch
    || manifest.nodeVersion !== process.versions.node || manifest.hyperframesVersion !== '0.8.130' || manifest.hypitVersion !== '0.2.17') {
    throw new Error('Bundled editing runtime target or version mismatch');
  }
  const paths = {};
  for (const name of ['browser', 'ffmpeg', 'ffprobe']) {
    paths[name] = sourcePath(root, manifest[name].file);
    const info = fs.lstatSync(paths[name]);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Bundled editing dependency is missing: ' + name);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(paths[name])).digest('hex');
    if (sha256 !== manifest[name].sha256) throw new Error('Bundled editing dependency was changed: ' + name);
  }
  // Shipped dependencies are selected explicitly; a desktop launch has no useful tool PATH.
  process.env.HYPERFRAMES_BROWSER_PATH = paths.browser;
  process.env.PRODUCER_HEADLESS_SHELL_PATH = paths.browser;
  process.env.PRODUCER_FFMPEG_PATH = paths.ffmpeg;
  process.env.PRODUCER_FFPROBE_PATH = paths.ffprobe;
  const toolDirectories = [path.dirname(paths.ffmpeg)];
  if (process.platform === 'win32') {
    // Hypit's native worker supervisor uses the Windows PowerShell executable.
    const windows = process.env.SystemRoot || process.env.SYSTEMROOT;
    if (!windows || !path.isAbsolute(windows)) throw new Error('Windows system directory is unavailable');
    toolDirectories.push(path.join(windows, 'System32/WindowsPowerShell/v1.0'), path.join(windows, 'System32'));
  }
  process.env.PATH = [...toolDirectories, process.env.PATH || ''].join(path.delimiter);
}
