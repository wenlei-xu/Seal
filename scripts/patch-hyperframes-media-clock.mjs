import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { nestedCompositionInpoint } from '../edit-host/hyperframes-media-clock.mjs';
import crypto from 'node:crypto';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repo, 'edit-host/package.json'));
const { parse } = require('acorn');
const root = path.dirname(require.resolve('hyperframes/package.json'));
if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version !== '0.8.130') throw new Error('Patch only the pinned CLI');
const dist = path.join(root, 'dist');
function replaceFunction(text, name, replacement) {
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  const node = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  if (!node) throw new Error('Pinned function not found: ' + name);
  return text.slice(0, node.start) + replacement + text.slice(node.end);
}
function patchRuntime(runtime) {
  if (runtime.includes('function nestedCompositionInpoint')) return runtime;
  const parents = new WeakMap(); let target, input, element;
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    parents.set(node, parent);
    if (node.type === 'Property' && node.key.name === 'ordinaryStart') {
      let owner = parent; while (owner && owner.type !== 'ArrowFunctionExpression') owner = parents.get(owner);
      if (target) throw new Error('Runtime resolver is ambiguous');
      target = owner;
      input = owner.body.body[0].declarations[0].id.name;
      element = owner.params[0].name;
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, node)); else if (value && typeof value === 'object') walk(value, node);
  }
  walk(parse(runtime, { ecmaVersion: 'latest' }));
  if (!target) throw new Error('Pinned runtime media resolver not found');
  const returned = target.body.body.find(node => node.type === 'ReturnStatement');
  const expression = runtime.slice(returned.argument.start, returned.argument.end);
  const corrected = `return (${expression})-(${nestedCompositionInpoint.toString()})(${element},${input}.basis);`;
  return runtime.slice(0, returned.start) + corrected + runtime.slice(returned.end);
}

function patchInlineFX(runtime) {
  if (runtime.includes('hfClockOffset')) return runtime;
  const ast = parse(runtime, { ecmaVersion: 'latest' });
  let renderName, renderFunction, elapsed;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression'
      && node.left.property.name === '__HF_AUDIO_FX') renderName = node.right.properties.find(property => property.key.name === 'render').value.name;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  }
  walk(ast);
  function locate(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id.name === renderName) renderFunction = node;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(locate); else if (value && typeof value === 'object') locate(value);
  }
  locate(ast);
  function clock(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && node.key.name === 'elapsed' && node.value.value === 0) elapsed = node.value;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(clock); else if (value && typeof value === 'object') clock(value);
  }
  clock(renderFunction);
  if (!renderFunction || !elapsed) throw new Error('Pinned offline FX clock not found');
  const paramEnd = renderFunction.params.at(-1).end;
  return runtime.slice(0, paramEnd) + ',hfClockOffset=0' + runtime.slice(paramEnd, elapsed.start) + 'hfClockOffset' + runtime.slice(elapsed.end);
}

const producerFile = path.join(dist, 'chunk-ZMXUQLI2.js');
let producer = fs.readFileSync(producerFile, 'utf8');
producer = replaceFunction(producer, 'collectRenderMedia', `function collectRenderMedia(html) {
  return collectClockedRenderMedia(html, {parseHTML,MEDIA_RENDER_ID_ATTR,MEDIA_START_BASIS_ATTR,
    parseVideoElements,parseImageElements,parseAudioElements,resolveReferencedStart,resolveHostEnd,readMediaStartBasis,sourceTimeAt});
}`);
if (!producer.includes('import { collectClockedRenderMedia }')) producer = 'import { collectClockedRenderMedia } from "../../../hyperframes-media-clock.mjs";\n' + producer;
// sourceTimeAt is already exported by the engine's rate helpers.
if (!/\n  sourceTimeAt[,\n]/.test(producer)) producer = producer.replace('  parseAudioElements,', '  parseAudioElements,\n  sourceTimeAt,');
fs.writeFileSync(producerFile, producer);

const engineFile = path.join(dist, 'chunk-K2FTXJYH.js');
let engine = fs.readFileSync(engineFile, 'utf8');
engine = engine.replace('function volumeLaneKeyframes(automation, trackStart, duration) {', 'function volumeLaneKeyframes(automation, trackStart, duration, offset = 0) {');
engine = engine.replace('if (!lane || lane.points.length === 0) return null;\n  const out = [];',
  'if (!lane || lane.points.length === 0) return null;\n  if(offset > 0) return shiftedVolumeKeyframes(lane,trackStart,duration,offset,sampleAutomationLane);\n  const out = [];');
engine = engine.replace('volumeLaneKeyframes(automation, element.start, element.end - element.start)', 'volumeLaneKeyframes(automation, element.start, element.end - element.start, element.automationOffset ?? 0)');
engine = engine.replace('async function renderPlanesInPage(page, sampleRate, chain, automationJson) {', 'async function renderPlanesInPage(page, sampleRate, chain, automationJson, clockOffset = 0) {');
engine = engine.replace('async ([rate, chainJson, automation]) => {', 'async ([rate, chainJson, automation, clockOffset]) => {');
engine = engine.replace('w.__HF_AUDIO_FX.render(inPlanes, rate, chainJson, automation || void 0)', 'w.__HF_AUDIO_FX.render(inPlanes, rate, chainJson, automation || void 0, clockOffset)');
engine = engine.replace('[sampleRate, JSON.stringify(chain), automationJson]', '[sampleRate, JSON.stringify(chain), automationJson, clockOffset]');
engine = engine.replace('options.automation ? serializeAutomation(options.automation) : ""\n', 'options.automation ? serializeAutomation(options.automation) : "",\n        options.automationOffset ?? 0\n');
engine = engine.replace('...automation ? { automation } : {},\n              ...envelope', '...automation ? { automation, automationOffset: element.automationOffset ?? 0 } : {},\n              ...envelope');
const engineAst = parse(engine, { ecmaVersion: 'latest', sourceType: 'module' });
const fxDeclaration = engineAst.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'AUDIO_FX_RUNTIME_IIFE'));
const fxLiteral = fxDeclaration.declarations.find(item => item.id.name === 'AUDIO_FX_RUNTIME_IIFE').init;
engine = engine.slice(0, fxLiteral.start) + JSON.stringify(patchInlineFX(fxLiteral.value)) + engine.slice(fxLiteral.end);
if (!engine.includes('import { shiftedVolumeKeyframes }')) engine = 'import { shiftedVolumeKeyframes } from "../../../hyperframes-media-clock.mjs";\n' + engine;
fs.writeFileSync(engineFile, engine);

// The CLI and live preview contain the same generated core runtime in four
// carriers. Patch its one media resolver rather than introducing a second clock.
for (const name of ['chunk-HWKCIWQT.js', 'hyperframe-runtime.js', 'hyperframe.runtime.iife.js']) {
  const file = path.join(dist, name);
  let text = fs.readFileSync(file, 'utf8');
  if (name.startsWith('chunk-')) {
    const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    const declaration = ast.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'RUNTIME_IIFE'));
    const literal = declaration.declarations.find(item => item.id.name === 'RUNTIME_IIFE').init;
    text = text.slice(0, literal.start) + JSON.stringify(patchRuntime(literal.value)) + text.slice(literal.end);
  } else text = patchRuntime(text);
  fs.writeFileSync(file, text);
}
const manifestFile = path.join(dist, 'hyperframe.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
manifest.sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, 'hyperframe.runtime.iife.js'))).digest('hex');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log('Patched the pinned nested media clock');
