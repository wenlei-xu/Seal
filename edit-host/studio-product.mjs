import { parse } from 'acorn';

const cache = new Map();
const keysOf = node => node?.params?.[0]?.type === 'ObjectPattern'
  ? node.params[0].properties.map(prop => prop.key?.name ?? prop.key?.value) : [];
function nodesOf(root) {
  const nodes = [];
  function visit(node) {
    if (!node?.type) return;
    nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  }
  visit(root); return nodes;
}
function only(nodes, predicate, label) {
  const matches = nodes.filter(predicate);
  if (matches.length !== 1) throw new Error(`Pinned Studio ${label} contract changed (${matches.length})`);
  return matches[0];
}
const property = (node, name) => node.properties?.find(prop => (prop.key?.name ?? prop.key?.value) === name);
const binding = prop => prop.value.type === 'AssignmentPattern' ? prop.value.left.name : prop.value.name;

// Customize the pinned, shipped Studio components in memory. Structural matches
// fail closed on version drift; project files and the installed package stay untouched.
export function productStudioBundle(source) {
  if (cache.has(source)) return cache.get(source);
  const nodes = nodesOf(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  const component = (...keys) => only(nodes, node => ['FunctionDeclaration', 'FunctionExpression'].includes(node.type)
    && keys.every(key => keysOf(node).includes(key)), keys.join('/'));
  const toolbar = component('domEditSession', 'showKeyframes', 'rightActions');
  const left = component('lintFindingCount', 'onAddAssetToTimeline');
  const header = component('captureFrameHref', 'inspectorPanelActive');
  const track = component('lanesId', 'trackElements', 'contentOrigin');
  const pane = component('timelineOverlay', 'onDeleteElement', 'onRangeSelect');
  const shell = component('panels', 'handleFreezeFrame', 'handleTimelineElementDeleteOnly');
  const body = component('captionEditMode', 'previewOverlay', 'onDeleteElement');
  const partNodes = nodesOf;
  const react = partNodes(toolbar).find(node => node.type === 'MemberExpression' && node.property.name === 'useEffect').object.name;
  const jsx = partNodes(toolbar).find(node => node.type === 'MemberExpression' && ['jsx', 'jsxs'].includes(node.property.name)).object.name;
  const player = partNodes(toolbar).find(node => node.type === 'CallExpression' && node.callee.type === 'Identifier'
    && source.slice(node.start, node.end).includes('.timelineSnapEnabled')).callee.name;
  const contextCall = (node, key) => only(partNodes(node), item => item.type === 'VariableDeclarator'
    && item.id.type === 'ObjectPattern' && property(item.id, key) && item.init?.type === 'CallExpression', `${key} context`).init.callee.name;
  const shellContext = contextCall(left, 'waitForPendingDomEditSaves');
  const filesContext = contextCall(left, 'handleContentChange');
  const timelineContext = contextCall(pane, 'onResizeElements');
  const dock = only(partNodes(body), node => node.type === 'MemberExpression' && node.property.name === 'Root', 'Dock.Root').object.name;
  const dockStore = partNodes(left).find(node => node.type === 'MemberExpression' && node.property.name === 'getState').object.name;
  const linked = only(nodes, node => node.type === 'VariableDeclarator' && node.init?.type === 'CallExpression'
    && node.init.arguments.some(argument => partNodes(argument).some(child => child.type === 'ObjectExpression'
      && property(child, 'setLinkedSelection') && property(child, 'syncIndicatorsVisible'))), 'linked selection store').id.name;
  const tooltip = component('label','children','delay','side');
  const bridge = `{React:${react},jsx:${jsx},Tooltip:${tooltip.id.name},player:${player},dock:${dockStore},linked:${linked},shell:${shellContext},files:${filesContext},timeline:${timelineContext}}`;
  const edits = [];
  function replace(node, text) { edits.push({ start: node.start, end: node.end, text }); }
  function wrap(node, name, extra = '') {
    const native = source.slice(node.start, node.end).replace(/^function\s+[\w$]+\(/, 'function(');
    const expression = `function ${node.id?.name || `__bf${name}`}(props){return ${jsx}.jsx(window.__BeeftvEditor.${name},{...props,bridge:${bridge},native:${native}${extra}})}`;
    replace(node, expression);
  }
  wrap(toolbar, 'Toolbar');
  wrap(track, 'TrackHeader');
  wrap(header, 'Header');
  wrap(component('clipboardCopied', 'onCopyElementInfo', 'displayX', 'onSetAttributeQuiet'), 'Inspector');
  wrap(component('name', 'meta', 'elementKind', 'onClear', 'copied'), 'SelectionHeader');
  wrap(only(nodes, node => ['FunctionDeclaration', 'FunctionExpression'].includes(node.type)
    && keysOf(node).length === 4 && ['onAskAgent','recordingState','recordingDuration','onToggleRecording'].every(key => keysOf(node).includes(key)), 'inspector footer'), 'InspectorFooter');
  const emptySelection = only(nodes, node => node.type === 'FunctionDeclaration' && node.params.length === 0
    && partNodes(node).some(child => child.type === 'Literal' && child.value === 'Record a gesture'), 'empty selection');
  replace(emptySelection, `function ${emptySelection.id.name}(){return ${jsx}.jsx(window.__BeeftvEditor.EmptySelection,{bridge:${bridge}})}`);
  replace(left, `function(props){return ${jsx}.jsx(${dock}.Panel,{id:"assets",children:${jsx}.jsx(window.__BeeftvEditor.Library,{...props,bridge:${bridge}})})}`);
  // The original providers keep timing-basis handling and all write/history logic.
  const actions = shell.params[0].properties.filter(prop => prop.key?.name?.startsWith('handle') || ['onCopyClip','onPasteClip','onDuplicateClip','canPasteClip'].includes(prop.key?.name));
  edits.push({ start: shell.body.start + 1, end: shell.body.start + 1,
    text: `window.__BeeftvEditor.actions={${actions.map(prop => `${prop.key.name}:${binding(prop)}`).join(',')}};` });
  const rootCall = only(partNodes(body), node => node.type === 'CallExpression' && node.arguments[0]?.type === 'MemberExpression'
    && node.arguments[0].property.name === 'Root', 'Dock root props');
  const rootProps = rootCall.arguments[1];
  edits.push({ start: rootProps.start + 1, end: rootProps.start + 1,
    text: 'panels:["preview","timeline","assets","design","renders"],storageKey:"beeftv-edit-layout-v2",' });
  // Restrict default tabs and windows to the creator's workflow.
  for (const node of nodes) {
    if (node.type === 'ArrayExpression') {
      const values = node.elements.map(item => item?.value).join(',');
      if (values === 'compositions,assets,code,catalog') replace(node, '["assets"]');
      if (values === 'design,layers,renders,variables') replace(node, '["design"]');
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'push'
      && node.arguments[0]?.type === 'ObjectExpression' && property(node.arguments[0], 'id')?.value.value === 'motion') replace(node, 'void 0');
  }
  const editGate = only(nodes, node => node.type === 'FunctionDeclaration' && node.params.length === 2
    && source.slice(node.start, node.end).match(/for\(const [\w$]+ of [\w$]+\)/)
    && source.slice(node.start, node.end).includes('.reason') && source.slice(node.start, node.end).includes('return null'), 'timeline edit gate');
  edits.push({ start: editGate.body.start + 1, end: editGate.body.start + 1,
    text: `if(${editGate.params[1].name}.some(window.__BeeftvEditor.isLocked))return "轨道已锁定，请先解锁";` });
  // Track-height math drives hit testing as well as drawing. Change the actual
  // shared constant, then refresh the element-derived layout when the user adjusts it.
  const heightNames = partNodes(track).filter(node => node.type === 'Property' && node.key.name === 'height'
    && node.value.type === 'Identifier').map(node => node.value.name);
  const height = only(nodes, node => node.type === 'VariableDeclarator' && node.init?.value === 48
    && heightNames.includes(node.id.name), 'track height');
  replace(height.init, '72');
  const heightDeclaration = nodes.find(node => node.type === 'VariableDeclaration' && node.declarations.includes(height));
  if (heightDeclaration.kind === 'const') edits.push({ start: heightDeclaration.start, end: heightDeclaration.start + 5, text: 'let' });
  const originReturn = only(nodes, node => node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression'
    && node.argument.properties.length === 2 && property(node.argument,'labelMode') && property(node.argument,'contentOrigin'), 'track origin');
  const originFunction = nodes.find(node => node.type === 'FunctionDeclaration' && node.start < originReturn.start && node.end > originReturn.end);
  const originName = property(originReturn.argument,'contentOrigin').value.name;
  const originExpression = only(partNodes(originFunction), node => node.type === 'VariableDeclarator' && node.id.name === originName, 'origin expression').init;
  const padNames = [originExpression.alternate.left.name, originExpression.alternate.right.name];
  const gutterPad = only(nodes, node => node.type === 'VariableDeclarator' && node.init?.value === 48 && padNames.includes(node.id.name), 'track gutter pad');
  replace(gutterPad.init, '108');
  // A track is still a valid lane after its last clip moves out. Preserve the
  // numbered gaps in the native packing, insertion and row derivation together.
  const zonePacking = only(nodes, node => node.type === 'FunctionDeclaration' && node.params.length === 3
    && partNodes(node).some(child => child.type === 'ForOfStatement'
      && child.left.declarations?.[0]?.id.type === 'Identifier'
      && partNodes(child.body).some(item => item.type === 'AssignmentExpression' && item.operator === '+='
        && item.right.type === 'CallExpression' && item.right.arguments.length === 3))
    && partNodes(node).some(child => child.type === 'MemberExpression' && child.property.name === 'track'), 'zone lane packing');
  const packLoop = only(partNodes(zonePacking), node => node.type === 'ForOfStatement'
    && partNodes(node.body).some(child => child.type === 'AssignmentExpression' && child.operator === '+='
      && child.right.type === 'CallExpression' && child.right.arguments.length === 3), 'zone packing loop');
  const packUpdate = partNodes(packLoop.body).find(node => node.type === 'AssignmentExpression' && node.operator === '+=');
  const packMap = partNodes(packLoop.right).find(node => node.type === 'MemberExpression' && node.property.name === 'keys').object.name;
  edits.push({start:packLoop.start,end:packLoop.start,text:`const __bfTrackBase=Math.min(${zonePacking.params[1].name},...${packMap}.keys());`});
  replace(packLoop.body,`{${packUpdate.left.name}=Math.max(${packUpdate.left.name},${packLoop.left.declarations[0].id.name}-__bfTrackBase);${source.slice(packLoop.body.start,packLoop.body.end)}}`);
  const insertLayout = only(nodes, node => node.type === 'FunctionDeclaration' && node.params.length === 5
    && partNodes(node).some(child => child.type === 'ReturnStatement' && child.argument?.type === 'ObjectExpression'
      && ['normalized','targetTrack','writable'].every(key => property(child.argument,key))), 'track insertion layout');
  const insertNodes = partNodes(insertLayout);
  const ranks = only(insertNodes, node => node.type === 'AssignmentExpression' && node.right.type === 'NewExpression'
    && node.right.callee.name === 'Map' && node.right.arguments[0]?.type === 'CallExpression', 'insertion ranks');
  const order = ranks.right.arguments[0].callee.object.name;
  const target = only(insertNodes, node => node.type === 'VariableDeclarator' && node.init?.type === 'ConditionalExpression'
    && node.init.test.name === ranks.left.name && node.init.consequent.type === 'BinaryExpression', 'insertion target');
  const insertRow = target.init.consequent.left.name;
  const movedTrack = only(insertNodes, node => node.type === 'Property' && node.key.name === 'track'
    && node.value.name === target.id.name, 'inserted clip track');
  replace(movedTrack.value, insertRow);
  const peerTrack = only(insertNodes, node => node.type === 'VariableDeclarator' && node.init?.type === 'ConditionalExpression'
    && node.init.test.name === ranks.left.name && node.init.consequent.type === 'CallExpression', 'insertion peer track');
  const peer = peerTrack.init.alternate.object.name;
  replace(peerTrack.init, `(()=>{const rank=${order}.indexOf(${peer}.track);return rank<0?undefined:rank+(rank>=${insertRow}?1:0)})()`);
  const elements = insertLayout.params[4].name;
  const layoutReturn = insertNodes.find(node=>node.type==='ReturnStatement'&&node.argument?.type==='ObjectExpression'&&property(node.argument,'writable'));
  const writableFilter = insertNodes.find(node=>node.type==='VariableDeclarator'&&node.id.name===property(layoutReturn.argument,'writable').value.name).init;
  const zoneCheck = only(partNodes(writableFilter), node => node.type === 'BinaryExpression' && node.operator === '==='
    && node.left.type === 'CallExpression' && node.right.type === 'Identifier', 'insertion zone check');
  const writableZone = only(insertNodes, node => node.type === 'VariableDeclarator' && node.id.name === zoneCheck.right.name, 'insertion zone');
  const zone = writableZone.init.callee.name;
  const topologyDeclaration = insertNodes.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(item=>item.id.name===order));
  const targetIntent = property(layoutReturn.argument,'targetTrack').value.name;
  edits.push({start:topologyDeclaration.end,end:topologyDeclaration.end,
    text:`{const all=${elements}.elements,audioBoundary=Math.max(-1,...all.filter(clip=>${zone}(clip)!=="audio").map(clip=>clip.track))+1;${order}=[...new Set([...${order},...${elements}.trackOrder.filter(track=>Number.isInteger(track)&&!all.some(clip=>clip.track===track)&&(${writableZone.id.name}==="audio"?track>=audioBoundary:track<audioBoundary))])].sort((a,b)=>a-b);${insertRow}=${order}.filter(track=>track<${targetIntent}).length;}` });
  const displayTracks = only(nodes, node => node.type === 'FunctionDeclaration' && node.params.length === 2
    && partNodes(node).some(child => child.type === 'ReturnStatement' && child.argument?.type === 'ObjectExpression'
      && property(child.argument,'trackOrder') && child.argument.properties.some(prop=>prop.type==='SpreadElement')), 'display track rows');
  const rawTracks = only(partNodes(displayTracks), node => node.type === 'VariableDeclarator'
    && node.init?.type === 'CallExpression' && node.init.callee.property?.name === 'sort', 'ordered track rows');
  const trackMap = partNodes(rawTracks.init).find(node=>node.type==='MemberExpression'&&node.property.name==='entries').object.name;
  const rawDeclaration = partNodes(displayTracks).find(node=>node.type==='VariableDeclaration'&&node.declarations.includes(rawTracks));
  edits.push({start:rawDeclaration.start,end:rawDeclaration.start,
    text:`{const keys=[...${trackMap}.keys()].filter(Number.isInteger),last=Math.max(-1,...keys);if(last<=4096)for(let lane=0;lane<=last;lane++)if(!${trackMap}.has(lane))${trackMap}.set(lane,[]);}` });
  const globalBridge = `\nwindow.__BeeftvEditor.connect(${bridge},function(value){${height.id.name}=value;const state=${player}.getState();${player}.setState({elements:[...state.elements]});});\n`;
  let result = '', offset = 0;
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    if (edit.start < offset) continue;
    result += source.slice(offset, edit.start) + edit.text; offset = edit.end;
  }
  result += source.slice(offset) + globalBridge;
  parse(result, { ecmaVersion: 'latest', sourceType: 'module' });
  if (cache.size >= 2) cache.clear();
  cache.set(source, result); return result;
}
