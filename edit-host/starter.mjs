import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureHfIds } from './hyperframes.mjs';

const require = createRequire(import.meta.url);

export async function initializeProject(dir) {
  const entry = path.join(dir, 'index.html');
  try { await fs.access(entry); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(entry, ensureHfIds(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>剪辑工程</title><script src="assets/gsap.min.js"></script><script src="assets/MotionPathPlugin.min.js"></script>
<style>html,body{margin:0;width:100%;height:100%;background:#101216}#main{position:relative;width:100%;height:100%;overflow:hidden}</style>
</head><body><div id="main" data-composition-id="main" data-start="0" data-duration="1" data-width="1080" data-height="1920" data-fps="30" data-no-timeline></div></body></html>`), { flag: 'wx' });
  await fs.writeFile(path.join(dir, 'hyperframes.json'), JSON.stringify({ version: 1, media: { autoProxy: false } }));
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.copyFile(require.resolve('gsap/dist/gsap.min.js'), path.join(dir, 'assets', 'gsap.min.js'));
  await fs.copyFile(require.resolve('gsap/dist/MotionPathPlugin.min.js'), path.join(dir, 'assets', 'MotionPathPlugin.min.js'));
}
