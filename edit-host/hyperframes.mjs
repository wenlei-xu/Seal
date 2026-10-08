import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('hyperframes/package.json'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== '0.8.130') throw new Error('Unsupported HyperFrames version: integration requires 0.8.130');
const dist = path.join(root, 'dist');
const serverFile = (await fs.readdir(dist)).filter(name => /^studioServer-[\w-]+\.js$/.test(name));
if (serverFile.length !== 1) throw new Error('HyperFrames Studio server bundle is missing or ambiguous');
// This internal export is deliberately pinned and checked by integration tests; no source tree is needed at runtime.
const { createStudioServer } = await import(pathToFileURL(path.join(dist, serverFile[0])).href);
const parserFiles = [];
for (const name of (await fs.readdir(dist)).filter(name => /^chunk-[\w-]+\.js$/.test(name))) {
  if (/^function ensureHfIds\(/m.test(await fs.readFile(path.join(dist, name), 'utf8'))) parserFiles.push(name);
}
if (parserFiles.length !== 1) throw new Error('HyperFrames source identity parser is missing or ambiguous');
export const { ensureHfIds, bundleToSingleHtml } = await import(pathToFileURL(path.join(dist, parserFiles[0])).href);
if (typeof ensureHfIds !== 'function') throw new Error('HyperFrames source identity contract changed');
export const hyperframesCLI = path.join(root, 'bin', 'hyperframes.mjs');
export const hyperframesSkills = path.join(dist, 'skills');

export function openStudio(projectDir, editId, historyRoot) {
  const studio = createStudioServer({ projectDir, projectName: editId, historyRoot, autoProxy: false });
  if (!studio.app || !studio.adapter?.history || !studio.shutdown) throw new Error('Studio host contract changed');
  return studio;
}
