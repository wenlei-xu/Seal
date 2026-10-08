import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseHTML } from 'linkedom';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { failure, safeId, sourcePath, atomicJson, atomicProjectSource } from './project-store.mjs';
import { ensureHfIds } from './hyperframes.mjs';
import { attachHypitAudio } from './hypit-audio.mjs';

const scriptLiteral = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function flattenProgramScopes(css) {
  const tree = postcss.parse(css);
  tree.walkAtRules('scope', scope => {
    const match = /^\(\s*#([a-zA-Z0-9_-]+)\s*\)$/.exec(scope.params);
    if (!match) throw failure('unsupported_css_scope', 'This CSS scope requires a dedicated scene conversion');
    scope.walkRules(rule => {
      for (let parent = rule.parent; parent && parent !== scope; parent = parent.parent) {
        if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
      }
      rule.selector = selectorParser(selectors => {
        selectors.each(selector => {
          let hasScope = false;
          selector.walkPseudos(pseudo => { if (pseudo.value === ':scope') { pseudo.replaceWith(selectorParser.id({ value: match[1] })); hasScope = true; } });
          if (!hasScope) { selector.prepend(selectorParser.combinator({ value: ' ' })); selector.prepend(selectorParser.id({ value: match[1] })); }
        });
      }).processSync(rule.selector);
    });
    scope.replaceWith(...scope.nodes);
  });
  return tree.toString();
}

export function adaptHypitDocument(value, sceneId) {
  safeId(sceneId);
  if (value?.visualIr !== 'hypit.visual-ir@1' || typeof value.html !== 'string') {
    throw failure('invalid_hypit_document', 'A compiled Hypit HyperFrames document is required');
  }
  const { numerator, denominator } = value.frameRate || {};
  if (![numerator, denominator, value.frameCount, value.canvas?.width, value.canvas?.height].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw failure('invalid_clock', 'Scene frame rate, frame count and canvas must be positive exact integers');
  }
  const { document } = parseHTML(value.html);
  const root = document.querySelector('[data-composition-id]');
  if (!root || Number(root.getAttribute('data-hypit-frame-count')) !== value.frameCount) {
    throw failure('invalid_hypit_document', 'Hypit compiler frame-domain metadata is missing');
  }
  if (document.querySelector('script[src],iframe,object,embed,base')) throw failure('external_scene_code', 'Scene scripts must be compiler-owned and self-contained');
  const duration = value.frameCount * denominator / numerator;
  root.setAttribute('data-composition-id', sceneId);
  root.setAttribute('id', `${sceneId}-root`);
  root.removeAttribute('data-no-timeline');
  root.setAttribute('style', 'position:relative;width:100%;height:100%;overflow:hidden');
  const scripts = [...document.querySelectorAll('script')].map(node => node.textContent);
  document.querySelectorAll('script').forEach(node => node.remove());
  const css = flattenProgramScopes([...document.querySelectorAll('style')].map(node => node.textContent).join('\n'));
  document.querySelectorAll('style').forEach(node => node.remove());
  // All Hypit seek consumers receive the scene's source clock through its native child timeline.
  // They never subscribe to the master hf-seek event, so split/move and source in-points remain independent.
  const program = `(function(baseWindow,document,gsap){
    const seekListeners=[];
    // Hypit's capture metadata is immutable. It belongs to this mount, not the
    // page: sharing it would abort initialization of a second scene instance.
    const instanceGlobals=Object.create(null);
    instanceGlobals.__timelines={};
    const window=new Proxy(instanceGlobals,{get(target,key){
      if(Reflect.has(target,key))return Reflect.get(target,key,target);
      if(key==='document')return document;
      if(key==='addEventListener') return (type,fn,...rest)=>type==='hf-seek'?seekListeners.push(fn):baseWindow.addEventListener(type,fn,...rest);
      const value=Reflect.get(baseWindow,key,baseWindow);
      return typeof value==='function' && value.prototype===undefined?value.bind(baseWindow):value;
    },set(target,key,value){
      return key==='__timelines'||typeof key==='string'&&key.startsWith('__hypit')?Reflect.set(target,key,value,target):Reflect.set(baseWindow,key,value,baseWindow);
    },defineProperty(target,key,descriptor){
      return typeof key==='string'&&key.startsWith('__hypit')?Reflect.defineProperty(target,key,descriptor):Reflect.defineProperty(baseWindow,key,descriptor);
    }});
    const globalThis=window;
    ${scripts.join('\n;\n')}
    const clock={seconds:0};
    const apply=waitUntil=>{
      for(const timeline of Object.values(instanceGlobals.__timelines))timeline.totalTime(clock.seconds,false);
      for(const listener of seekListeners)listener({detail:{time:clock.seconds,waitUntil}});
      if(instanceGlobals.__hypitBrowserProgramError)throw new Error(instanceGlobals.__hypitBrowserProgramError);
    };
    const tl=gsap.timeline({paused:true});
    tl.to(clock,{seconds:${duration},duration:${duration},ease:'none',onUpdate:apply},0);
    const totalTime=tl.totalTime;
    tl.totalTime=function(time,...rest){if(arguments.length===0)return totalTime.call(this);const result=totalTime.call(this,time,...rest);clock.seconds=Math.max(0,Math.min(${duration},time));apply();return result;};
    // Native splits change the mount's composition id while keeping its source.
    // Register only that mount; the authored-id alias would overwrite its sibling.
    const runtimeId=tl.__hfScopedCompositionRoot?.getAttribute('data-composition-id')||${scriptLiteral(sceneId)};
    baseWindow.__timelines[runtimeId]=tl;
    // Forward readiness promises (not the master time) to the render barrier,
    // including Hypit's exact-font text layout and GPU drawing completion.
    baseWindow.addEventListener('hf-seek',event=>apply(event.detail?.waitUntil));
  })(window,document,gsap);`;
  return { html: ensureHfIds(`<!doctype html><html><body><template><style>${css}\n#${sceneId}-root{position:relative;width:100%;height:100%;overflow:hidden}</style>${root.outerHTML}<script>${program.replaceAll('</script', '<\\/script')}</script></template></body></html>`), duration, frameRate: { numerator, denominator }, canvas: value.canvas };
}

function assertAssetClosure(html, names) {
  const { document } = parseHTML(html);
  const attributes = ['src', 'href', 'poster', 'data-hypit-resource-src', 'data-hypit-resource-href'];
  const references = [...document.querySelectorAll(attributes.map(attr => `[${attr}]`).join(','))]
    .flatMap(node => attributes.map(attr => node.getAttribute(attr)).filter(Boolean));
  for (const match of html.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) references.push(match[1]);
  for (const ref of references) {
    if (ref.startsWith('#') || ref.startsWith('data:')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(ref) || ref.startsWith('/')) throw failure('unresolved_asset', 'Scene assets must be materialized local files');
    const relative = decodeURIComponent(ref.split(/[?#]/)[0]);
    sourcePath('C:/candidate', relative);
    if (!names.has(relative)) throw failure('asset_missing', `Scene asset is missing: ${relative}`);
  }
}

function materializeResources(document, resources, files) {
  const declared = new Map((document.artifacts || []).map(entry => [entry.artifact.resource, entry.artifact]));
  const available = new Map(files.map(file => [file.path, file]));
  const resolved = new Map();
  for (const binding of resources) {
    if (resolved.has(binding.resource)) throw failure('duplicate_resource', 'Resource has more than one file binding');
    const artifact = declared.get(binding.resource);
    const file = available.get(binding.path);
    if (!artifact || !file) throw failure('resource_missing', 'Resource must name a declared artifact and an included file');
    const bytes = typeof file.text === 'string' ? Buffer.from(file.text) : typeof file.base64 === 'string' ? Buffer.from(file.base64, 'base64') : null;
    if (!bytes || bytes.length !== artifact.size) throw failure('resource_size_mismatch', 'Resource byte size differs from the compiler artifact');
    resolved.set(binding.resource, binding.path.split('/').map(encodeURIComponent).join('/'));
  }
  const html = document.html.replace(/hypit-resource:\/\/(res_[a-zA-Z0-9._:-]+)/g, (_uri, resource) => {
    if (!resolved.has(resource)) throw failure('resource_missing', `Compiler resource is not materialized: ${resource}`);
    return resolved.get(resource);
  });
  return { ...document, html };
}

export function createHypitScenes(store, gateway) {
  async function create(editId, input) {
    const current = await store.state(editId);
    if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) throw failure('invalid_revision', 'Candidate must capture its starting revision');
    if (input.document?.visualIr !== 'hypit.visual-ir@1' || typeof input.document.html !== 'string'
      || !Array.isArray(input.document.artifacts) || !Array.isArray(input.files || []) || !Array.isArray(input.resources || [])
      || !Array.isArray(input.audioTracks || [])) throw failure('invalid_hypit_document', 'A compiled document and explicit resource arrays are required');
    const candidateId = `candidate_${crypto.randomUUID().replaceAll('-', '')}`;
    const sceneId = `scene_${candidateId.slice(-24)}`;
    const materialized = materializeResources(attachHypitAudio(input.document, input.audioTracks), input.resources || [], input.files || []);
    const adapted = adaptHypitDocument(materialized, sceneId);
    const directory = path.join(store.editDir(editId), 'candidates', candidateId);
    const files = [{ path: 'scene.html', text: adapted.html }, ...(input.files || [])];
    const names = new Set(files.map(file => file.path));
    if (names.size !== files.length) throw failure('duplicate_asset', 'Candidate contains duplicate asset paths');
    assertAssetClosure(materialized.html, names);
    const manifest = [];
    for (const file of files) {
      const target = sourcePath(directory, file.path);
      if (/^(\.hyperframes|node_modules|\.git)(\/|$)/.test(file.path) || ['source.json', 'candidate.json'].includes(file.path)) throw failure('unsafe_path', 'Reserved candidate path');
      const bytes = typeof file.text === 'string' ? Buffer.from(file.text) : typeof file.base64 === 'string' ? Buffer.from(file.base64, 'base64') : null;
      if (!bytes || bytes.length > 32 * 1024 * 1024) throw failure('invalid_asset', 'Each candidate file must contain bounded bytes');
      if (file.sha256 && digest(bytes) !== file.sha256) throw failure('asset_hash_mismatch', 'Asset bytes changed in transfer');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: 'wx' });
      manifest.push({ path: file.path, sha256: digest(bytes) });
    }
    const source = { document: input.document, audioTracks: input.audioTracks || [], resources: input.resources || [] };
    await atomicJson(path.join(directory, 'source.json'), source);
    const candidate = { candidateId, sceneId, editId, projectId: current.projectId, baseRevision: input.baseRevision,
      sourceHash: digest(JSON.stringify(source)),
      logicalKey: safeId(input.logicalKey || sceneId), duration: adapted.duration, frameRate: adapted.frameRate,
      canvas: adapted.canvas, files: manifest, status: 'ready', createdAt: new Date().toISOString() };
    await atomicJson(path.join(directory, 'candidate.json'), candidate);
    return candidate;
  }

  async function list(editId) {
    const directory = path.join(store.editDir(editId), 'candidates');
    const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const results = await Promise.all(names.filter(name => /^candidate_[a-zA-Z0-9_]+$/.test(name)).map(async name => {
      try { return JSON.parse(await fs.readFile(path.join(directory, safeId(name), 'candidate.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }));
    return results.filter(Boolean);
  }

  async function promote(editId, input) {
    const directory = path.join(store.editDir(editId), 'candidates', safeId(input.candidateId));
    const candidate = JSON.parse(await fs.readFile(path.join(directory, 'candidate.json'), 'utf8'));
    const source = JSON.parse(await fs.readFile(path.join(directory, 'source.json'), 'utf8'));
    if (candidate.editId !== editId || digest(JSON.stringify(source)) !== candidate.sourceHash) throw failure('candidate_changed', 'Candidate provenance was modified', 409);
    if (candidate.kind === 'hyperframes') {
      let gate;
      try { gate = JSON.parse(await fs.readFile(path.join(directory, 'verified.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!gate?.ok || gate.command !== 'check' || gate.cliVersion !== '0.8.130'
        || gate.sourceHash !== candidate.sourceHash || gate.filesHash !== digest(JSON.stringify(candidate.files))
        || gate.report?.ok !== true || gate.report?.browserSkipped !== false || !gate.imageFiles?.length) {
        throw failure('candidate_check_required', '请先用官方 check 完成此候选的浏览器检查', 409);
      }
    }
    const owned = await gateway.open(editId);
    let start = input.start ?? 0;
    let track = input.track ?? 0;
    let duration = candidate.duration;
    const replaceId = input.replaceSceneId === undefined ? null : safeId(input.replaceSceneId);
    if (replaceId && input.append === true) throw failure('invalid_placement', 'Choose append or replace');
    if (!Number.isFinite(start) || start < 0 || !Number.isSafeInteger(track) || track < 0) throw failure('invalid_placement', 'Scene start and track are invalid');
    const expectedRevision = input.expectedRevision ?? candidate.baseRevision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw failure('invalid_revision', 'Read the target edit before importing');
    const receipt = await store.transaction(editId, { operationId: input.operationId, expectedRevision,
      requestKey: digest(JSON.stringify({ candidateId: input.candidateId, start, track, append: input.append === true, replaceId, expectedRevision, actor: input.actor === 'person' ? 'person' : 'agent' })) }, async dir => {
      const checked = await Promise.all(candidate.files.map(async file => {
        const bytes = await fs.readFile(sourcePath(directory, file.path));
        if (digest(bytes) !== file.sha256) throw failure('candidate_changed', 'Immutable candidate was modified', 409);
        return { file, bytes };
      }));
      const sceneRoot = `scenes/${candidate.sceneId}`;
      try {
        await fs.access(sourcePath(dir, `${sceneRoot}/scene.html`));
        throw failure('candidate_already_used', '该结果已加入过轨道，可在编辑器中撤销或恢复', 409);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const entry = path.join(dir, 'index.html');
      const { document } = parseHTML(await fs.readFile(entry, 'utf8'));
      const root = document.querySelector('[data-composition-id]');
      if (!root) throw failure('master_missing', 'Master HyperFrames composition is missing');
      const clips = [...root.children].filter(node => node.classList.contains('clip'));
      const replaced = replaceId ? clips.find(node => node.id === replaceId) : null;
      if (replaceId) {
        if (!replaced || !['DIV', 'IMG', 'VIDEO'].includes(replaced.tagName) || (replaced.tagName === 'DIV' && !replaced.hasAttribute('data-composition-src'))) {
          throw failure('replace_target_missing', '请选择主轨道中的一个视频、图片或制作场景', 409);
        }
        start = Number(replaced.getAttribute('data-start'));
        track = Number(replaced.getAttribute('data-track-index'));
        duration = Number(replaced.getAttribute('data-duration'));
        if (![start, track, duration].every(Number.isFinite) || start < 0 || !Number.isSafeInteger(track) || track < 0 || duration <= 0) throw failure('invalid_timeline', 'Replacement target has invalid timing');
        if (duration > candidate.duration + 1e-6) throw failure('replacement_too_short', '制作结果比选中片段短，请重新制作足够长度的结果', 409);
      } else if (input.append === true) {
        start = Math.max(0, ...clips.map(node => Number(node.getAttribute('data-start') || 0) + Number(node.getAttribute('data-duration') || 0)));
        if (!Number.isFinite(start)) throw failure('invalid_timeline', 'Existing clips have invalid timing');
      }
      const producer = candidate.kind === 'hyperframes' ? 'HyperFrames' : 'Hypit';
      const who = input.actor === 'person' ? { kind: 'person', name: 'You' } : { kind: 'agent', name: producer };
      const window = await owned.history.beginWindow(who, `${replaceId ? 'Replace' : 'Import'} ${producer} scene`);
      try {
        for (const { file, bytes } of checked) {
          const target = sourcePath(dir, `${sceneRoot}/${file.path}`);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, bytes, { flag: 'wx' });
        }
        if (!root.children.length) {
          root.setAttribute('data-width', String(candidate.canvas.width));
          root.setAttribute('data-height', String(candidate.canvas.height));
        }
        const mount = document.createElement('div');
        const mountId = replaceId || candidate.sceneId;
        for (const [key, value] of Object.entries({ id: mountId, class: 'clip', 'data-composition-id': mountId,
          'data-composition-src': `${sceneRoot}/scene.html`, 'data-start': start, 'data-duration': duration,
          'data-track-index': track, 'data-width': candidate.canvas.width, 'data-height': candidate.canvas.height,
          'data-playback-start': 0, 'data-beeftv-scene-key': replaced?.getAttribute('data-beeftv-scene-key') || candidate.logicalKey,
          ...(replaced?.hasAttribute('data-label') ? { 'data-label': replaced.getAttribute('data-label') } : {}) })) mount.setAttribute(key, String(value));
        mount.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%');
        if (replaced) root.replaceChild(mount, replaced); else root.appendChild(mount);
        root.setAttribute('data-duration', String(Math.max(Number(root.getAttribute('data-duration')) || 0, start + duration)));
        await atomicProjectSource(store, editId, 'index.html', ensureHfIds(document.toString()));
        await window.close();
        return { candidateId: candidate.candidateId, sceneId: mountId, sourceFile: `${sceneRoot}/scene.html`, start, duration, replacedSceneId: replaceId };
      } catch (error) { await window.close(); throw error; }
    });
    return receipt;
  }
  return { create, list, promote };
}
