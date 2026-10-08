import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createProjectStore } from '../edit-host/project-store.mjs';
import { initializeProject } from '../edit-host/starter.mjs';
import { createStudioGateway } from '../edit-host/studio-gateway.mjs';
import { ensureHfIds } from '../edit-host/hyperframes.mjs';

const require = createRequire(new URL('../edit-host/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const clipCount = process.env.TRACK_DROP_TWO_CLIPS === '1' ? 2 : 1;
const directory = path.resolve('.local/cache/editor-track-drop', `run-${Date.now()}`);
const store = createProjectStore(directory);
const edit = await store.ensure('track_drop_smoke');
const work = store.workDir(edit.editId);
await initializeProject(work);
execFileSync(process.env.PRODUCER_FFMPEG_PATH || path.resolve('.local/cache/creator-shipped-v1/edit-host/media/ffmpeg/bin/ffmpeg.exe'),
  ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=teal:s=320x180:r=30','-t','3','-c:v','libx264','-pix_fmt','yuv420p',path.join(work,'assets','sample.mp4')], { windowsHide:true });
await fs.writeFile(path.join(work,'index.html'),ensureHfIds(`<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>html,body{margin:0}#main{position:relative;overflow:hidden}video{position:absolute;width:100%;height:100%;object-fit:contain}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="6" data-width="1280" data-height="720" data-fps="30" data-no-timeline><video id="first" class="clip" src="assets/sample.mp4" data-start="0" data-duration="3" data-track-index="0" muted></video>${clipCount === 2 ? '<video id="second" class="clip" src="assets/sample.mp4" data-start="3" data-duration="3" data-track-index="0" muted></video>' : ''}</div></body></html>`));
const gateway = createStudioGateway(store);
const owned = await gateway.open(edit.editId);
const parent = http.createServer((req,res) => {
  const launch = owned.ticket(`http://127.0.0.1:${parent.address().port}`);
  res.setHeader('Content-Type','text/html');
  res.end(`<html><body style="margin:0"><form method="post" action="${launch.studioUrl}/__session" target="studio"><input name="ticket" value="${launch.ticket}"></form><iframe name="studio" style="width:100vw;height:100vh;border:0"></iframe><script>document.querySelector('form').submit();document.querySelector('form').hidden=true</script></body></html>`);
});
await new Promise(resolve=>parent.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await puppeteer.launch({headless:true, executablePath:process.env.HYPERFRAMES_BROWSER_PATH || 'C:/Users/33583/.cache/puppeteer/chrome-headless-shell/win64-153.0.8010.36/chrome-headless-shell-win64/chrome-headless-shell.exe'});
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:860});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${parent.address().port}`);
  let frame;
  for(let i=0;i<60;i++) {
    frame=page.frames().find(item=>item.url().startsWith(owned.origin));
    if(frame && await frame.$('.bf-track-header')) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(frame,'Studio frame did not mount');
  await frame.waitForFunction(count=>window.__BeeftvEditor.player.getState().elements.length===count,{},clipCount);
  assert.equal(await frame.$$eval('.bf-track-header',items=>items.length),1);
  async function snapshot() {
    return frame.evaluate(()=>({elements:window.__BeeftvEditor.player.getState().elements.map(({key,id,start,track,authoredTrack})=>({key,id,start,track,authoredTrack})),headers:document.querySelectorAll('.bf-track-header').length,notice:document.querySelector('.bf-notice')?.textContent}));
  }
  async function dragDown() {
    const clips=await frame.$$('[data-clip]');
    const box=await clips[clipCount-1].boundingBox();
    const headers=await frame.$$('.bf-track-header');
    const row=await headers[headers.length-1].boundingBox();
    const x=box.x+box.width*.45, y=box.y+box.height*.5;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x,y+8,{steps:2});
    await page.mouse.move(x,Math.min(row.y+row.height+Number(process.env.TRACK_DROP_OFFSET || 120),page.viewport().height-50),{steps:16});
    await page.screenshot({path:path.join(directory,'drag.png')});
    await page.mouse.up();
  }
  console.log('before',JSON.stringify(await snapshot()));
  await dragDown();
  try {
    await frame.waitForFunction(()=>document.querySelectorAll('.bf-track-header').length===2,{timeout:5000});
  } catch(error) {
    await page.screenshot({path:path.join(directory,'failed.png')});
    throw new Error(`Dragging a video below its track did not create a second track: ${JSON.stringify(await snapshot())}; screenshot=${path.join(directory,'failed.png')}`,{cause:error});
  }
  await frame.waitForFunction(()=>!document.querySelector('button[aria-label="撤销（Ctrl+Z）"]').disabled);
  await frame.waitForFunction(async count=>{
    const response=await fetch(`/api/projects/${window.__BEEFTV_EDIT__.editId}/files/index.html`);
    const {content}=await response.json();
    const doc=new DOMParser().parseFromString(content,'text/html');
    return count === 1 ? Number(doc.getElementById('first').getAttribute('data-track-index')) > 0 : doc.getElementById('first').getAttribute('data-track-index')!==doc.getElementById('second').getAttribute('data-track-index');
  },{},clipCount);
  const after=await snapshot();
  console.log('saved',JSON.stringify(after));
  await page.screenshot({path:path.join(directory,'after.png')});
  await page.goto(`http://127.0.0.1:${parent.address().port}`);
  for(let i=0;i<60;i++) {
    frame=page.frames().find(item=>item.url().startsWith(owned.origin));
    if(frame && await frame.$('.bf-track-header')) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  await frame.waitForFunction(count=>window.__BeeftvEditor.player.getState().elements.length===count,{},clipCount);
  const reopened=await snapshot();
  console.log('reopened',JSON.stringify(reopened));
  assert.equal(reopened.headers,2,'The saved new track collapsed when the editor reread the project');
  if(clipCount === 1) {
    await dragDown();
    try { await frame.waitForFunction(()=>document.querySelectorAll('.bf-track-header').length===3,{timeout:5000}); }
    catch(error) { throw new Error(`Repeated track insertion failed: ${JSON.stringify(await snapshot())}`,{cause:error}); }
    await frame.waitForFunction(async()=>{
      const {content}=await (await fetch(`/api/projects/${window.__BEEFTV_EDIT__.editId}/files/index.html`)).json();
      return new DOMParser().parseFromString(content,'text/html').getElementById('first').getAttribute('data-track-index')==='2';
    });
    await frame.waitForFunction(()=>!document.querySelector('button[aria-label="撤销（Ctrl+Z）"]').disabled);
    await frame.click('button[aria-label="撤销（Ctrl+Z）"]');
    await frame.waitForFunction(()=>document.querySelectorAll('.bf-track-header').length===2 && !document.querySelector('button[aria-label="重做（Ctrl+Shift+Z）"]').disabled);
    await frame.click('button[aria-label="重做（Ctrl+Shift+Z）"]');
    await frame.waitForFunction(()=>document.querySelectorAll('.bf-track-header').length===3);
    await frame.waitForFunction(async()=>{
      const {content}=await (await fetch(`/api/projects/${window.__BEEFTV_EDIT__.editId}/files/index.html`)).json();
      return new DOMParser().parseFromString(content,'text/html').getElementById('first').getAttribute('data-track-index')==='2';
    });
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,after,directory,checks:['pointer-drag-below','saved-track-index','reload',...(clipCount===1?['repeat-insert','undo','redo']:[])]},null,2));
} finally {
  await browser?.close();
  parent.closeAllConnections();
  await new Promise(resolve=>parent.close(resolve));
  await gateway.close();
}
