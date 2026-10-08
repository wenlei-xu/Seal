import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { parseHTML } from 'linkedom';
import { parse } from 'acorn';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { failure, safeId, sourcePath, atomicJson, assertPlainTree } from './project-store.mjs';
import { ensureHfIds, hyperframesCLI } from './hyperframes.mjs';

const require = createRequire(import.meta.url);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const environment = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|LOCALAPPDATA|APPDATA|COMSPEC)$/i.test(key)
  || /^(HYPERFRAMES_BROWSER_PATH|PRODUCER_HEADLESS_SHELL_PATH|PRODUCER_FFMPEG_PATH|PRODUCER_FFPROBE_PATH)$/.test(key))),
  HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' });

function authorScript(script) {
  if (typeof script !== 'string' || Buffer.byteLength(script) > 1024 * 1024) throw failure('invalid_scene_script', 'Scene script must be bounded GSAP source');
  const tree = parse(script, { ecmaVersion: 'latest', sourceType: 'script' });
  // This is an authoring contract, not a general-purpose JavaScript sandbox.
  // Keep generated scenes in the local DOM/GSAP vocabulary, without host APIs.
  const forbidden = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
    'eval', 'Function', 'require', 'process', 'parent', 'top', 'opener', 'location', 'navigator', 'localStorage',
    'sessionStorage', 'cookie', 'constructor', '__proto__', 'prototype', 'setTimeout', 'setInterval',
    'requestAnimationFrame', 'globalThis', '__timelines']);
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ImportExpression' || node.type === 'WithStatement'
      || node.type === 'Identifier' && forbidden.has(node.name)
      || node.type === 'Literal' && typeof node.value === 'string' && forbidden.has(node.value)) {
      throw failure('scene_api_forbidden', 'Use scoped DOM/GSAP and product tools; scene code cannot call host, network or timer APIs');
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (typeof value === 'object') walk(value);
  }
  walk(tree);
  return script;
}

function scopedCSS(css, rootId) {
  if (typeof css !== 'string' || Buffer.byteLength(css) > 1024 * 1024) throw failure('invalid_scene_css', 'CSS is too large');
  const tree = postcss.parse(css);
  tree.walkAtRules(rule => {
    if (/^(import|font-face|keyframes|-webkit-keyframes)$/i.test(rule.name)) {
      if (rule.name.toLowerCase() === 'import') throw failure('external_scene_code', 'Use local scene styles');
      if (/keyframes/i.test(rule.name)) throw failure('scene_clock_required', 'Use seekable GSAP animation instead of CSS keyframes');
    }
  });
  tree.walkRules(rule => {
    rule.selector = selectorParser(selectors => selectors.each(selector => {
      selector.walkPseudos(pseudo => { if (pseudo.value === ':root') pseudo.replaceWith(selectorParser.id({ value: rootId })); });
      if (!selector.toString().startsWith(`#${rootId}`)) {
        selector.prepend(selectorParser.combinator({ value: ' ' }));
        selector.prepend(selectorParser.id({ value: rootId }));
      }
    })).processSync(rule.selector);
  });
  return tree.toString();
}

function assertReferences(html, names) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  if (document.querySelector('script,style,iframe,object,embed,base,link,template')) throw failure('external_scene_code', 'Provide scene body markup without scripts/styles or embedded documents');
  const refs = [];
  for (const node of document.querySelectorAll('*')) {
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.name) || ['srcdoc', 'srcset', 'data-composition-src'].includes(attr.name)) throw failure('external_scene_code', 'Scene event handlers and external composition sources are not allowed');
      if (['src', 'href', 'poster'].includes(attr.name)) refs.push(attr.value);
    }
  }
  for (const match of html.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) refs.push(match[1]);
  for (const ref of refs) {
    if (ref.startsWith('#') || /^data:(image|audio|video)\//i.test(ref)) continue;
    const name = decodeURIComponent(ref.split(/[?#]/)[0]);
    sourcePath(path.resolve('.'), name);
    if (!names.has(name)) throw failure('asset_missing', `Bind the local scene asset: ${name}`);
  }
  return document.body.innerHTML;
}

export function createHyperframesScenes(store) {
  const running = new Set();
  async function candidate(editId, candidateId) {
    const directory = path.join(store.editDir(editId), 'candidates', safeId(candidateId));
    const value = JSON.parse(await fs.readFile(path.join(directory, 'candidate.json'), 'utf8'));
    if (value.kind !== 'hyperframes' || value.editId !== editId) throw failure('candidate_scope_mismatch', 'This is not a HyperFrames candidate of the current edit', 403);
    await assertPlainTree(directory);
    const source = JSON.parse(await fs.readFile(path.join(directory, 'source.json'), 'utf8'));
    if (hash(JSON.stringify(source)) !== value.sourceHash) throw failure('candidate_changed', 'Candidate source changed', 409);
    for (const file of value.files) if (hash(await fs.readFile(sourcePath(directory, file.path))) !== file.sha256) throw failure('candidate_changed', 'Candidate file changed', 409);
    return { directory, value };
  }

  async function context(editId, gateway) {
    return store.locked(editId, async () => {
      const current = await store.state(editId);
      const { document } = parseHTML(await fs.readFile(path.join(store.workDir(editId), 'index.html'), 'utf8'));
      const root = document.querySelector('[data-composition-id]');
      const owned = await gateway.open(editId);
      const selected = await owned.studio.app.request(`/api/projects/${editId}/selection`);
      return { editId, projectId: current.projectId, revision: current.revision, runtime: '0.8.130',
        width: Number(root?.getAttribute('data-width')), height: Number(root?.getAttribute('data-height')),
        duration: Number(root?.getAttribute('data-duration')), fps: Number(root?.getAttribute('data-fps') || 30),
        selection: selected.ok ? await selected.json() : null,
        clips: [...document.querySelectorAll('.clip')].map(node => ({ id: node.id, hfId: node.getAttribute('data-hf-id'),
          tag: node.tagName.toLowerCase(), label: node.getAttribute('data-label'), start: Number(node.getAttribute('data-start')),
          duration: Number(node.getAttribute('data-duration')), track: Number(node.getAttribute('data-track-index')),
          source: node.getAttribute('data-composition-src') || node.getAttribute('src'),
          playbackStart: Number(node.getAttribute('data-playback-start') || 0) })) };
    });
  }

  async function create(editId, input) {
    const current = await store.state(editId);
    if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision !== current.revision) throw failure('revision_conflict', 'Read the current edit before authoring a scene', 409);
    const { width, height, duration } = input;
    const fps = input.fps ?? 30;
    if (![width, height, fps].every(n => Number.isSafeInteger(n) && n > 0) || width > 8192 || height > 8192 || width * height > 16_777_216
      || fps > 120 || !Number.isFinite(duration) || duration <= 0 || duration > 600) throw failure('invalid_scene_clock', 'Scene dimensions, fps or duration are invalid');
    if (typeof input.html !== 'string' || Buffer.byteLength(input.html) > 1024 * 1024 || !Array.isArray(input.assets || []) || (input.assets || []).length > 64) throw failure('invalid_scene', 'Bounded scene markup and local asset bindings are required');
    const candidateId = `candidate_${crypto.randomUUID().replaceAll('-', '')}`;
    const sceneId = `scene_${candidateId.slice(-24)}`;
    const rootId = `${sceneId}-root`;
    const css = scopedCSS(input.css || '', rootId);
    const script = authorScript(input.script);
    const names = new Set((input.assets || []).map(asset => asset.path));
    if (names.size !== (input.assets || []).length || [...names].some(name => ['scene.html', 'source.json', 'candidate.json'].includes(name))) throw failure('duplicate_asset', 'Candidate asset paths must be unique');
    const body = assertReferences(input.html, names);
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      const ref = match[1];
      if (!ref.startsWith('#') && !/^data:(image|audio|video)\//i.test(ref) && !names.has(decodeURIComponent(ref.split(/[?#]/)[0]))) throw failure('asset_missing', 'Bind local CSS assets');
    }
    const program = `(function(document,gsap,window){${script}\n;
      if(typeof tl==='undefined'||!tl||typeof tl.totalTime!=='function'||!tl.paused())throw new Error('Define a paused GSAP tl timeline');
      const runtimeId=tl.__hfScopedCompositionRoot?.getAttribute('data-composition-id')||${literal(sceneId)};
      window.__timelines[runtimeId]=tl;
    })(document,gsap,window);`;
    const html = ensureHfIds(`<!doctype html><html><body><template><style>#${rootId}{position:relative;width:100%;height:100%;overflow:hidden}${css}</style>
      <div id="${rootId}" data-composition-id="${sceneId}" data-width="${width}" data-height="${height}" data-duration="${duration}" data-fps="${fps}">${body}</div>
      <script>${program.replace(/<\/script/gi, '<\\/script')}</script></template></body></html>`);
    const directory = path.join(store.editDir(editId), 'candidates', candidateId);
    await fs.mkdir(directory, { recursive: true });
    const files = [];
    await fs.writeFile(path.join(directory, 'scene.html'), html, { flag: 'wx' });
    files.push({ path: 'scene.html', sha256: hash(html) });
    await store.locked(editId, async () => {
      if ((await store.state(editId)).revision !== input.baseRevision) throw failure('revision_conflict', 'Edit changed while binding assets', 409);
      await assertPlainTree(store.workDir(editId));
      let total = Buffer.byteLength(html);
      for (const asset of input.assets || []) {
        if (!/\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|ogg|m4a|woff2?|ttf|otf)$/i.test(asset.path)) throw failure('invalid_asset', 'Bind local image, video, audio or font files');
        const target = sourcePath(directory, asset.path);
        if (/^(checks|\.hyperframes|node_modules|\.git)(\/|$)/i.test(asset.path)) throw failure('unsafe_path', 'Reserved scene path');
        const from = sourcePath(store.workDir(editId), asset.source);
        const info = await fs.stat(from);
        if (!info.isFile() || info.size > 128 * 1024 * 1024 || (total += info.size) > 256 * 1024 * 1024) throw failure('asset_too_large', 'Scene asset exceeds the local candidate limit');
        const bytes = await fs.readFile(from);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes, { flag: 'wx' });
        files.push({ path: asset.path, sha256: hash(bytes) });
      }
    });
    const source = { kind: 'hyperframes', cliVersion: '0.8.130', html: input.html, css: input.css || '', script, assets: input.assets || [] };
    await atomicJson(path.join(directory, 'source.json'), source);
    const value = { kind: 'hyperframes', candidateId, sceneId, editId, projectId: current.projectId, baseRevision: input.baseRevision,
      sourceHash: hash(JSON.stringify(source)), logicalKey: sceneId, duration, frameRate: { numerator: fps, denominator: 1 },
      canvas: { width, height }, files, status: 'unchecked', createdAt: new Date().toISOString() };
    await atomicJson(path.join(directory, 'candidate.json'), value);
    return value;
  }

  async function runCLI(cwd, args) {
    const child = spawn(process.execPath, [hyperframesCLI, ...args], { cwd, env: environment(), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    running.add(child);
    let stdout = '', stderr = '', size = 0, expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, 120_000);
    const collect = target => bytes => {
      size += bytes.length;
      if (size > 4 * 1024 * 1024) { child.kill(); return; }
      if (target === 'out') stdout += bytes.toString(); else stderr += bytes.toString();
    };
    child.stdout.on('data', collect('out')); child.stderr.on('data', collect('err'));
    try {
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
      if (expired || size > 4 * 1024 * 1024) throw failure('cli_limit', 'Official check exceeded its execution/output limit', 408);
      return { exitCode: code, stdout, stderr: stderr.slice(-8192) };
    } finally { clearTimeout(timer); running.delete(child); }
  }

  async function inspectionProject(editId, id) {
    const { directory, value } = await candidate(editId, id);
    const inspectionDir = path.join(directory, 'checks', crypto.randomUUID());
    // The pinned linter recursively scans compositions/, not arbitrary scenes/.
    // Mount the identical candidate bytes there so both child lint and runtime run.
    const sceneRoot = `compositions/${value.sceneId}`;
    for (const file of value.files) {
      const target = sourcePath(inspectionDir, `${sceneRoot}/${file.path}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(sourcePath(directory, file.path), target);
    }
    await fs.mkdir(path.join(inspectionDir, 'assets'), { recursive: true });
    for (const name of ['gsap.min.js', 'MotionPathPlugin.min.js']) await fs.copyFile(require.resolve(`gsap/dist/${name}`), path.join(inspectionDir, 'assets', name));
    await fs.writeFile(path.join(inspectionDir, 'index.html'), `<!doctype html><html><head><script src="assets/gsap.min.js"></script><script src="assets/MotionPathPlugin.min.js"></script><style>html,body{margin:0}#main{position:relative;overflow:hidden;width:100%;height:100%}</style></head><body><div id="main" data-composition-id="main" data-duration="${value.duration}" data-width="${value.canvas.width}" data-height="${value.canvas.height}" data-fps="${value.frameRate.numerator}" data-no-timeline><div class="clip" id="${value.sceneId}" data-composition-id="${value.sceneId}" data-composition-src="${sceneRoot}/scene.html" data-start="0" data-duration="${value.duration}" data-track-index="0" data-width="${value.canvas.width}" data-height="${value.canvas.height}" style="position:absolute;inset:0"></div></div></body></html>`);
    return { directory, value, inspectionDir };
  }

  async function inspect(editId, input) {
    if (!['lint', 'check', 'snapshot'].includes(input.command)) throw failure('command_forbidden', 'Use the pinned official lint, check or snapshot command', 403);
    const { directory, value, inspectionDir } = await inspectionProject(editId, input.candidateId);
    const args = [input.command, inspectionDir];
    if (input.command === 'snapshot') args.push('--frames', '5');
    else args.push('--json', ...(input.command === 'check' ? ['--snapshots', '--timeout', '30000'] : []));
    const result = await runCLI(inspectionDir, args);
    let report = null;
    if (input.command !== 'snapshot') {
      try { report = JSON.parse(result.stdout.trim()); } catch { /* Invalid official JSON is a failed gate. */ }
    }
    const images = [];
    let imageBytes = 0;
    async function frames(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (images.length >= 8) break;
        const name = path.join(dir, entry.name);
        if (entry.isDirectory()) await frames(name);
        else if (/\.png$/i.test(entry.name)) {
          const bytes = await fs.readFile(name);
          if (bytes.length <= 4 * 1024 * 1024 && imageBytes + bytes.length <= 12 * 1024 * 1024) {
            imageBytes += bytes.length;
            images.push({ file: path.relative(inspectionDir, name).replaceAll('\\', '/'), mimeType: 'image/png', data: bytes.toString('base64') });
          }
        }
      }
    }
    if (input.command !== 'lint') await frames(inspectionDir);
    const ok = result.exitCode === 0 && (input.command === 'snapshot' ? images.length > 0 : input.command === 'lint' ? report !== null : report?.ok === true && report?.browserSkipped === false && images.length > 0);
    const receipt = { candidateId: value.candidateId, command: input.command, cliVersion: '0.8.130', sourceHash: value.sourceHash,
      inspectionId: path.basename(inspectionDir),
      filesHash: hash(JSON.stringify(value.files)), ok, exitCode: result.exitCode, report,
      log: result.stdout.slice(-12000), stderr: result.stderr, imageFiles: images.map(image => image.file), createdAt: new Date().toISOString() };
    await atomicJson(path.join(inspectionDir, 'result.json'), receipt);
    if (input.command === 'check') await atomicJson(path.join(directory, 'verified.json'), receipt);
    return { ...receipt, images };
  }

  async function review(editId, candidateId) {
    const { directory, value } = await candidate(editId, candidateId);
    let gate;
    try { gate = JSON.parse(await fs.readFile(path.join(directory, 'verified.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!gate) return { candidate: value, ok: false, images: [] };
    const checked = path.join(directory, 'checks', safeId(gate.inspectionId));
    const images = [];
    for (const file of gate.imageFiles || []) {
      const bytes = await fs.readFile(sourcePath(checked, file));
      if (images.length < 8 && bytes.length <= 4 * 1024 * 1024) images.push({ file, data: bytes.toString('base64'), mimeType: 'image/png' });
    }
    return { candidate: value, ...gate, images };
  }

  async function close() { for (const child of running) child.kill(); }
  return { create, inspect, review, context, close, busy: () => running.size };
}
