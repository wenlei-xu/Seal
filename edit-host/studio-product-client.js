(() => {
  const config = window.__BEEFTV_EDIT__;
  const prefKey = `beeftv-editor-view:${config.editId}`;
  let preferences;
  try { preferences = JSON.parse(localStorage.getItem(prefKey) || '{}'); } catch { preferences = {}; }
  const locks = new Set(preferences.locks || []);
  const solos = new Set();
  const auditioned = new Map();
    const names = preferences.names || {};
  let runtime, heightSetter;
  const icons = window.__BEEFTV_EDIT_ICONS__;
  function e(type, props, ...children) { return runtime.React.createElement(type, props, ...children); }
  function icon(name) { return e('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false, 'data-icon': name },
    ...(icons[name] || icons.info).map(([tag,attributes], index) => e(tag, { ...attributes, key: index }))); }
  function post(action, prompt) { parent.postMessage({ type: 'beeftv:editor-action', editId: config.editId, action, prompt }, config.parentOrigin); }
  function saveView() { try { localStorage.setItem(prefKey, JSON.stringify(preferences = { ...preferences, locks: [...locks], names })); } catch { /* View preferences are optional. */ } }
  function notice(error) { window.dispatchEvent(new CustomEvent('beeftv:editor-notice', { detail: error instanceof Error ? error.message : String(error) })); }
  function safe(action) { return () => { try { Promise.resolve(action()).catch(notice); } catch (error) { notice(error); } }; }
  function Tool({ label, name, action, disabled, active, options }) {
    const [pending,setPending] = runtime.React.useState(false);
    const blocked = Boolean(disabled) || pending;
    const reason = pending ? '正在保存，请稍候' : typeof disabled === 'string' ? disabled : '';
    const hint = [label, reason || options.hint].filter(Boolean).join('\n');
    return e(runtime.Tooltip, { label: hint, delay: 320, side: options.side || 'top' },
      e('span', { className:'bf-tool-slot', ...(blocked ? {tabIndex:0,'aria-label':hint,'aria-disabled':true} : {}) },
        e('button', { type:'button', className:`bf-tool ${pending ? 'bf-tool-pending' : ''}`, 'aria-label':label,
          ...(active !== undefined ? {'aria-pressed':active} : {}), ...(options.expanded !== undefined ? {'aria-expanded':options.expanded,'aria-haspopup':'dialog'} : {}),
          disabled:blocked, 'aria-busy':pending || undefined, 'data-control':options.control,
          onKeyDown:event => { if(event.key === 'Enter' || event.key === ' ') event.stopPropagation(); },
          onClick:async () => {
            if(blocked) return;
            try {
              const result=action();
              if(result?.then) { setPending(true); await result; }
            } catch(error) { notice(error); } finally { setPending(false); }
          } }, pending ? icon('spinner') : options.text || icon(name))));
  }
  function tool(label, name, action, disabled = false, active, key, options = {}) {
    return e(Tool, { key:key || label, label, name, action, disabled, active, options });
  }
  function selected(store) { return store.elements.filter(clip => store.selectedElementIds.has(clip.key || clip.id) || store.selectedElementId === (clip.key || clip.id)); }
  function locked(clip) { return locks.has(String(clip.track)); }
  function ensureEditable(clips) { if (clips.some(locked)) throw new Error('轨道已锁定，请先解锁'); }
  function updateHeight(value) {
    value = Math.max(48, Math.min(120, Number(value) || 72));
    preferences.height = value; saveView(); heightSetter?.(value);
  }
  function applySolo(context) {
    const elements = runtime.player.getState().elements;
    for (const clip of elements) {
      const id = clip.key || clip.id;
      if (clip.tag !== 'audio' && !clip.hasAudio) continue;
      const silence = solos.size > 0 && !solos.has(String(clip.track));
      if (silence) {
        if (!auditioned.has(id)) auditioned.set(id, clip);
        context.onSetElementAttributeLive?.(clip, 'data-volume', '0');
      } else if (!silence && auditioned.has(id)) {
        context.onRevertElementAttributeLive?.(auditioned.get(id), 'data-volume'); auditioned.delete(id);
      }
    }
  }
  function Toolbar(props) {
    runtime = props.bridge;
    const { React, player } = runtime;
    const shell = runtime.shell();
    const context = runtime.timeline();
    const clips = player(state => state.elements);
    const selection = player(state => state.selectedElementIds);
    const anchor = player(state => state.selectedElementId);
    const snap = player(state => state.timelineSnapEnabled);
    const ripple = player(state => state.rippleEditEnabled);
    const activeTool = player(state => state.activeTool);
    const zoomMode = player(state => state.zoomMode);
    const zoom = player(state => state.manualZoomPercent);
    const linked = runtime.linked(state => state.linkedSelection);
    const [more, setMore] = React.useState(false);
    const [height, setHeight] = React.useState(preferences.height || 72);
    const [wave, setWave] = React.useState(preferences.wave || 'medium');
    const [speed, setSpeed] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const markersRef = React.useRef((preferences.markers || []).filter(value => Number.isFinite(value) && value >= 0).slice(0,200));
    const [markers, setMarkers] = React.useState(markersRef.current);
    const chosen = clips.filter(clip => selection.has(clip.key || clip.id) || anchor === (clip.key || clip.id));
    const editBlocked = busy ? '正在保存，请稍候' : !chosen.length ? '请先选择时间线中的片段' : chosen.some(locked) ? '请先解锁选中片段所在轨道' : false;
    const singleVideoBlocked = editBlocked || (chosen.length !== 1 || chosen[0]?.tag !== 'video' ? '请选择一个视频片段' : false);
    React.useEffect(() => {
      player.getState().setAutoKeyframeEnabled(false);
      const show = event => setStatus(event.detail);
      const clearSolo = () => { solos.clear(); applySolo(context); window.dispatchEvent(new Event('beeftv:solo-changed')); };
      window.addEventListener('beeftv:editor-notice', show);
      window.addEventListener('beeftv:before-export', clearSolo);
      return () => { window.removeEventListener('beeftv:editor-notice', show); window.removeEventListener('beeftv:before-export', clearSolo); };
    }, [player, context]);
    React.useEffect(() => { if (solos.size || auditioned.size) applySolo(context); }, [clips, context]);
    React.useEffect(() => {
      document.documentElement.dataset.bfWave = wave;
      preferences.wave = wave; saveView();
    }, [wave]);
    React.useEffect(() => { preferences.markers = markers; saveView(); }, [markers]);
    React.useEffect(() => {
      if (!more) return;
      const close = event => {
        if (event.type === 'keydown' ? event.key === 'Escape' : !event.target.closest('.bf-more-panel,button[aria-label="更多时间线工具"]')) {
          if(event.type === 'keydown') { event.preventDefault(); event.stopPropagation(); }
          setMore(false);
          if(event.type === 'keydown') document.querySelector('button[aria-label="更多时间线工具"]')?.focus();
        }
      };
      document.addEventListener('pointerdown',close); document.addEventListener('keydown',close,true);
      return () => { document.removeEventListener('pointerdown',close); document.removeEventListener('keydown',close,true); };
    }, [more]);
    async function run(action) {
      if (busy) return;
      setBusy(true); setStatus('');
      try { await action(); } catch (error) { notice(error); } finally { setBusy(false); }
    }
    function atPlayhead() { return player.getState().currentTime; }
    function resize(side) {
      const now = atPlayhead();
      const changes = chosen.map(clip => {
        const end = clip.start + clip.duration;
        if (now <= clip.start || now >= end) throw new Error('请将播放头放在选中片段内部');
        return side === 'left' ? { element: clip, start: now, duration: end - now,
          playbackStart: (clip.playbackStart || 0) + (now - clip.start) * (clip.playbackRate || 1) }
          : { element: clip, start: clip.start, duration: now - clip.start, playbackStart: clip.playbackStart };
      });
      return context.onResizeElements?.(changes);
    }
    async function remove(closeGap = false) {
      ensureEditable(chosen);
      const state = player.getState(), old = state.rippleEditEnabled;
      state.setRippleEditEnabled(closeGap);
      try { for (const clip of chosen) await api.actions.handleTimelineElementDelete(clip); }
      finally { state.setRippleEditEnabled(old); }
    }
    function changeZoom(value) { const state = player.getState(); state.setZoomMode('manual'); state.setManualZoomPercent(value); }
    const onCommand = action => () => run(action);
    const buttons = [
      tool('导入素材', 'plus', () => post('import-file')),
      tool('选择工具', 'pointer', () => player.getState().setActiveTool('select'), false, activeTool === 'select'),
      e('span', { className: 'bf-divider', key: 'd1' }),
      tool('撤销（Ctrl+Z）', 'undo', () => shell.handleUndo(), busy ? '正在保存，请稍候' : !shell.editHistory.canUndo ? '当前没有可撤销的修改' : false),
      tool('重做（Ctrl+Shift+Z）', 'redo', () => shell.handleRedo(), busy ? '正在保存，请稍候' : !shell.editHistory.canRedo ? '当前没有可重做的修改' : false),
      e('span', { className: 'bf-divider', key: 'd2' }),
      tool('在播放头处分割选中片段', 'scissors', onCommand(async () => {
        ensureEditable(chosen); const now = atPlayhead();
        const targets = chosen.filter(clip => now > clip.start && now < clip.start + clip.duration);
        if (!targets.length) throw new Error('请将播放头放在选中片段内部');
        for (const clip of targets) await context.onSplitElement?.(clip, now);
      }), editBlocked, undefined, undefined, {hint:'将播放头放在片段内部，在当前位置分成两段'}),
      tool('删除播放头左侧', 'left', onCommand(() => resize('left')), editBlocked, undefined, undefined, {hint:'裁掉片段中播放头之前的内容，保留右侧'}),
      tool('删除播放头右侧', 'right', onCommand(() => resize('right')), editBlocked, undefined, undefined, {hint:'裁掉片段中播放头之后的内容，保留左侧'}),
      tool('删除选中片段', 'trash', onCommand(() => remove(false)), editBlocked, undefined, undefined, {hint:'删除片段，保留原有间隙'}),
      tool('波纹删除', 'ripple', onCommand(() => remove(true)), editBlocked, undefined, undefined, {hint:'删除片段，并自动闭合主轨道上的间隙'}),
      e('span', { className: 'bf-divider', key: 'd3' }),
      tool('分离音频', 'audio', onCommand(() => context.onLinkEdit?.({ kind: 'detach', element: chosen[0] })), singleVideoBlocked || (!chosen[0]?.hasAudio ? '这个片段没有可分离的音轨' : false)),
      tool('变速', 'speed', () => setSpeed(value => !value), editBlocked || (!chosen.every(clip => ['video','audio'].includes(clip.tag)) ? '变速适用于视频或音频片段' : false), speed, undefined, {expanded:speed}),
      tool('在播放头处定格', 'freeze', onCommand(() => context.onFreezeFrame?.(chosen[0], atPlayhead())), singleVideoBlocked),
      tool('添加标记', 'flag', () => { const time = atPlayhead(); markersRef.current = [...markersRef.current, time]; setMarkers(markersRef.current); }, false),
      tool('让创作助手处理选中片段', 'sparkles', () => post('assistant', '请根据当前选中的片段帮我剪辑。')),
    ];
    return e('div', { className: 'bf-timeline-tools' },
      e('div', { className: 'bf-tool-row', role:'toolbar','aria-label':'时间线工具', onKeyDown:event => {
        if(!event.target.closest('button') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const items=[...event.currentTarget.querySelectorAll('button:not(:disabled)')];
        const current=items.indexOf(event.target.closest('button'));
        if(current<0) return;
        event.preventDefault(); event.stopPropagation();
        const index=event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (current+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;
        items[index]?.focus();
      } }, e('div', { className: 'bf-tool-group' }, ...buttons),
        e('div', { className: 'bf-tool-group bf-tools-end' },
          tool('主轨道磁吸：删除时自动闭合间隙', 'ripple', () => player.getState().setRippleEditEnabled(!ripple), false, ripple),
          tool('吸附：对齐片段边缘和播放头', 'magnet', () => player.getState().setTimelineSnapEnabled(!snap), false, snap),
          tool('关联选择', 'link', () => runtime.linked.getState().setLinkedSelection(!linked), false, linked),
          e('span', { className: 'bf-divider' }),
          tool('适配时间线宽度', 'fit', () => player.getState().setZoomMode('fit'), false, zoomMode === 'fit'),
          tool('缩小时间线', 'minus', () => changeZoom((zoomMode === 'fit' ? 100 : zoom) / 1.4)),
          e('input', { type: 'range', min: 50, max: 2000, step: 10, value: zoomMode === 'fit' ? 100 : Math.min(2000, zoom), 'aria-label': '时间线缩放', onChange: event => changeZoom(Number(event.target.value)) }),
          tool('放大时间线', 'plus', () => changeZoom((zoomMode === 'fit' ? 100 : zoom) * 1.4)),
          e('output', {className:'bf-zoom-readout','aria-label':'当前时间线缩放'}, zoomMode === 'fit' ? '适配' : `${Math.round(zoom)}%`),
          tool('更多时间线工具', 'more', () => setMore(value => !value), false, more, undefined, {expanded:more}))),
      more && e('div', { className: 'bf-more-panel', role: 'dialog', 'aria-label': '更多时间线工具' },
        e('label', null, '轨道高度', e('input', { type: 'range', min: 48, max: 120, step: 4, value: height, 'aria-label': '轨道高度', onChange: event => { const value = Number(event.target.value); setHeight(value); updateHeight(value); } })),
        e('div', { className: 'bf-wave-setting' }, '波形占比', ...['small','medium','large'].map((value, index) => e('button', { key: value, type: 'button', title: `${['小','中','大'][index]}波形`, 'aria-label': `${['小','中','大'][index]}波形`, 'aria-pressed': wave === value, onClick: () => setWave(value) }, icon(`wave-${value}`)))),
        e('button', { className: 'bf-inline', onClick: () => setMore(false) }, '收起')),
      speed && e('div', { className: 'bf-speed-panel' }, '播放速度', ...[0.5,1,1.5,2,3].map(rate => e('button', { type: 'button', key: rate, disabled: busy, onClick: safe(() => run(async () => {
        ensureEditable(chosen);
        for (const clip of chosen) {
          await context.onSetElementAttributeQuiet?.(clip, 'data-playback-rate', String(rate), '修改播放速度');
          await context.onResizeElement?.(clip, { start: clip.start, duration: clip.duration * (clip.playbackRate || 1) / rate, playbackStart: clip.playbackStart });
        }
        setSpeed(false);
      })) }, `${rate}×`))),
      markers.length > 0 && e('div', { className: 'bf-markers' }, ...markers.map((time,index) => e('button', { key: index, title: '点击跳到标记；右键删除', onClick: () => player.getState().requestSeek(time), onContextMenu: event => { event.preventDefault(); markersRef.current = markersRef.current.filter((_,i) => i !== index); setMarkers(markersRef.current); } }, `⚑ ${time.toFixed(2)}s`))),
      status && e('div', { className: 'bf-notice', role: 'alert' }, icon('info'), e('span',null,status), e('button', { onClick: () => setStatus(''), 'aria-label': '关闭提示' }, icon('close'))));
  }
  function TrackHeader(props) {
    runtime = props.bridge;
    const { React } = runtime;
    const context = runtime.timeline();
    const key = String(props.trackNumber);
    const defaultName = props.trackElements.length ? props.trackLabel : `轨道 ${props.trackDisplayNumber}`;
    const [version, refresh] = React.useReducer(value => value + 1, 0);
    const [renaming, setRenaming] = React.useState(false);
    const [name, setName] = React.useState(names[key] || defaultName);
    const audio = props.isAudioTrack;
    const [hiddenDraft,setHiddenDraft] = React.useState(null);
    const [muteDraft,setMuteDraft] = React.useState(null);
    const hidden = hiddenDraft ?? props.isTrackHidden;
    const soundClips = props.trackElements.filter(clip => clip.hasAudio);
    const muted = muteDraft ?? (soundClips.length > 0 && soundClips.every(clip => clip.muted || (clip.volume ?? 1) === 0));
    React.useEffect(() => {
      window.addEventListener('beeftv:solo-changed',refresh);
      return () => window.removeEventListener('beeftv:solo-changed',refresh);
    }, []);
    function finishName() { const next = name.trim(); if (next) names[key] = next; saveView(); setRenaming(false); }
    return e('div', { role: 'rowheader', 'aria-colindex': 1, 'data-bf-track': key,
      className: `bf-track-header ${locks.has(key) ? 'bf-locked' : ''}`,
      style: { width: props.contentOrigin, height: preferences.height || 72, background: props.theme.gutterBackground }, 'data-version': version,
      onPointerDown: event => event.stopPropagation() },
      e('div', { className: 'bf-track-title' }, icon(audio ? 'audio' : props.trackElements.length && props.trackElements.every(clip => clip.tag === 'div') ? 'type' : 'film'), renaming ? e('input', { autoFocus: true, value: name, 'aria-label': '轨道名称', onChange: event => setName(event.target.value), onBlur: finishName, onKeyDown: event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); finishName(); } if (event.key === 'Escape') { event.preventDefault(); setName(names[key] || defaultName); setRenaming(false); } } })
        : e('button', { title: '重命名轨道', className:'bf-track-name', onClick: () => { setName(names[key] || defaultName); setRenaming(true); } }, e('span',null,names[key] || defaultName), icon('pencil'))),
      e('div', { className: 'bf-track-buttons' },
        tool(locks.has(key) ? '解锁轨道' : '锁定轨道', locks.has(key) ? 'lock' : 'unlock', () => { locks.has(key) ? locks.delete(key) : locks.add(key); saveView(); refresh(); runtime.player.setState({ elements: [...runtime.player.getState().elements] }); }, false, locks.has(key),'lock',{control:'lock'}),
        tool(hidden ? (audio ? '取消轨道静音' : '显示轨道') : (audio ? '静音轨道' : '隐藏轨道'), audio ? (hidden ? 'mute' : 'volume') : (hidden ? 'eye-off' : 'eye'), async () => {
          setHiddenDraft(!hidden);
          try { await props.onToggleTrackHidden?.(props.trackNumber,!hidden,props.trackDisplayNumber); }
          finally { setHiddenDraft(null); }
        }, !props.trackElements.length ? '空轨道暂无片段' : locks.has(key) ? '请先解锁轨道' : false, hidden,'visibility',{control:'visibility',hint:audio ? '改变整条音频轨道的静音状态' : '改变整条轨道的画面可见状态'}),
        !audio && tool(muted ? '取消轨道声音静音' : '静音轨道声音', muted ? 'mute' : 'volume', async () => {
          const next = !muted;
          setMuteDraft(next);
          preferences.muteVolumes ||= {};
          try {
            for (const clip of soundClips) {
              const identity = clip.key || clip.id;
              if(next && (clip.volume ?? 1) > 0) preferences.muteVolumes[identity] = clip.volume ?? 1;
              const result = await context.onSetElementAttributeQuiet?.(clip,'data-volume',next ? '0' : String(preferences.muteVolumes[identity] ?? 1),'切换轨道声音');
              if(result?.status && result.status !== 'saved') throw new Error(result.reason || '轨道声音保存失败');
            }
            saveView();
          } finally { setMuteDraft(null); }
        }, !soundClips.length ? '这条轨道没有声音' : locks.has(key) ? '请先解锁轨道' : soundClips.some(clip => clip.muted) ? '素材本身已静音，请先在属性中取消静音' : false, muted,'mute',{control:'mute'}),
        tool('独奏轨道','volume',() => { solos.has(key) ? solos.delete(key) : solos.add(key); applySolo(context); window.dispatchEvent(new Event('beeftv:solo-changed')); },!audio && !soundClips.length ? '这条轨道没有声音' : false,solos.has(key),'solo',
          {control:'solo',text:'S',hint:solos.has(key) ? '关闭独奏，恢复其他轨道的声音' : '只试听这条轨道的声音（仅预览）'})));
  }
  function Header(props) {
    runtime = props.bridge;
    const shell = runtime.shell();
    return e('div', { className: 'bf-studio-header' },
      e('span', { className: 'bf-save-state' }, '● 自动保存'),
      e('div', { className: 'bf-header-actions' },
        e('a', { href: props.captureFrameHref, download: props.captureFrameFilename, onClick: props.handleCaptureFrameClick,
          onPointerDown: props.refreshCaptureFrameTime, title: '保存当前画面', className: 'bf-header-button' }, icon('download'), '截取画面'),
        e('button', { type: 'button', className: 'bf-header-button', onClick: () => post('aspect-ratio') }, '画面比例'),
        e('button', { type: 'button', className: 'bf-export-button', disabled: shell.renderQueue.isRendering, onClick: safe(async () => {
          window.dispatchEvent(new Event('beeftv:before-export'));
          await props.onExport?.();
        }) }, icon('upload'), shell.renderQueue.isRendering ? '正在导出' : '导出')));
  }
  function Library(props) {
    runtime = props.bridge;
    const { React } = runtime;
    const files = runtime.files();
    const shell = runtime.shell();
    const [category, setCategory] = React.useState('media');
    const [search, setSearch] = React.useState('');
    const [text, setText] = React.useState('在这里输入文字');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const input = React.useRef(null);
    const categories = [['media','素材','film'],['audio','音频','audio'],['text','文字','type'],['captions','字幕','captions']];
    const assets = files.assets.filter(path => (category === 'audio' ? /\.(mp3|wav|m4a|ogg|aac|flac)$/i : /\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i).test(path)
      && path.toLowerCase().includes(search.toLowerCase()));
    const mediaURL = path => `/api/projects/${encodeURIComponent(shell.projectId)}/preview/${path.split('/').map(encodeURIComponent).join('/')}`;
    async function addText(caption = false, cues) {
      setBusy(true); setError('');
      try {
        const response = await window.fetch('/api/beeftv/add-text', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, caption, cues, start: runtime.player.getState().currentTime, duration: 3 }) });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || '添加文字失败');
      } catch (reason) { setError(reason.message); } finally { setBusy(false); }
    }
    return e('div', { className: 'bf-library' },
      e('nav', { className: 'bf-library-tabs', 'aria-label': '编辑素材类别' }, ...categories.map(([key,label,glyph]) => e('button', { key, type: 'button', 'aria-pressed': category === key, onClick: () => setCategory(key) }, icon(glyph), label))),
      e('div', { className: 'bf-library-content' },
        e('div', { className: 'bf-library-sources' },
          e('button', { type: 'button', onClick: () => post('import-file') }, icon('upload'), '导入'),
          e('button', { type: 'button', 'aria-pressed': true, onClick: () => setSearch('') }, '工程素材'),
          e('button', { type: 'button', onClick: () => post('asset-library') }, icon('folder'), '资产库')),
        category === 'media' || category === 'audio' ? e(React.Fragment, null,
          e('label', { className: 'bf-search' }, icon('search'), e('input', { value: search, placeholder: '搜索素材名称', 'aria-label': '搜索素材名称', onChange: event => setSearch(event.target.value) })),
          e('div', { className: 'bf-media-grid' }, ...assets.map(path => {
            const video = /\.(mp4|mov|webm)$/i.test(path), audio = category === 'audio';
            return e('div', { className: 'bf-media-item', key: path, draggable: true, onDragStart: event => {
              event.dataTransfer.setData('application/x-hyperframes-asset', JSON.stringify({ path }));
              event.dataTransfer.setData('text/plain', path);
            } }, e('button', { className: 'bf-media-cover', title: '点击加入时间线', onClick: safe(() => props.onAddAssetToTimeline(path)) },
              audio ? icon('wave') : video ? e('video', { src: mediaURL(path), preload: 'metadata', muted: true }) : e('img', { src: mediaURL(path), alt: '', loading: 'lazy' }),
              e('span', { className: 'bf-add-badge' }, '+')),
              e('span', { className: 'bf-media-name', title: path }, path.split('/').pop()));
          })),
          !assets.length && e('div', { className: 'bf-media-empty' }, icon(category === 'audio' ? 'audio' : 'folder'), e('p', null, search ? '没有匹配的素材' : '还没有工程素材'),
            e('button', { type: 'button', onClick: () => post('import-file') }, '从文件导入'), e('button', { type: 'button', onClick: () => post('asset-library') }, '从资产库加入')))
          : e('div', { className: 'bf-text-tools' },
            category === 'text' ? e(React.Fragment, null, e('h3', null, '添加文字'), e('textarea', { value: text, onChange: event => setText(event.target.value), 'aria-label': '文字内容', maxLength: 4000 }),
              e('button', { className: 'bf-primary', disabled: busy || !text.trim(), onClick: () => addText() }, busy ? '正在添加' : '加入时间线'))
              : e(React.Fragment, null, e('h3', null, '字幕'),
                e('button', { className: 'bf-primary', onClick: () => post('assistant', '请识别当前工程的口播，生成带时间戳的中文字幕并加入字幕轨道。') }, icon('sparkles'), '识别字幕'),
                e('button', { disabled: busy, onClick: () => input.current?.click() }, icon('upload'), '导入 SRT 字幕'),
                e('input', { ref: input, type: 'file', accept: '.srt', hidden: true, onChange: async event => {
                  const file = event.target.files?.[0]; event.target.value = '';
                  if (!file) return;
                  try {
                    if (file.size > 1024 * 1024) throw new Error('字幕文件不能超过 1 MB');
                    const source = (await file.text()).replace(/\r/g, '');
                    const toTime = value => { const [h,m,s] = value.replace(',', '.').split(':').map(Number); return h*3600+m*60+s; };
                    const cues = source.trim().split(/\n\s*\n/).map(block => {
                      const lines = block.split('\n'); const timing = lines.findIndex(line => line.includes('-->'));
                      if (timing < 0) throw new Error('无法识别 SRT 时间格式');
                      const [start,end] = lines[timing].split('-->').map(value => toTime(value.trim()));
                      return { start, duration: end-start, text: lines.slice(timing+1).join('\n') };
                    });
                    await addText(true, cues);
                  } catch (reason) { setError(reason.message); }
                } }),
                e('textarea', { value: text, onChange: event => setText(event.target.value), 'aria-label': '手动字幕内容', maxLength: 4000 }),
                e('button', { disabled: busy || !text.trim(), onClick: () => addText(true) }, '添加当前字幕'))),
        error && e('p', { role: 'alert', className: 'bf-inline-error' }, error)));
  }
  function Inspector(props) {
    runtime = props.bridge;
    const { React } = runtime;
    const [tab, setTab] = React.useState('basic');
    const [error, setError] = React.useState('');
    const [saving,setSaving] = React.useState(false);
    const [saved,setSaved] = React.useState(false);
    const media = ['audio','video'].includes(props.element.tagName);
    const volume = Number(props.element.element?.getAttribute('data-volume') ?? 1);
    const rate = Number(props.element.element?.getAttribute('data-playback-rate') ?? 1);
    const commit = (attr,value) => safe(async () => {
      setError('');
      setSaving(true); setSaved(false);
      try {
        const clip = runtime.player.getState().elements.find(item => (item.key || item.id) === props.selectedElementId);
        if (clip) ensureEditable([clip]);
        await props.onSetAttribute(attr,String(value));
        setSaved(true);
      } catch (reason) { setError(reason.message); }
      finally { setSaving(false); }
    })();
    function commitNumber(input,attribute,minimum,maximum,scale,current) {
      const value=Number(input.value);
      if(!input.value.trim() || !Number.isFinite(value) || value<minimum || value>maximum) { setError(`请输入 ${minimum} 至 ${maximum} 之间的数值`); setSaved(false); return; }
      if(value/scale !== current) commit(attribute,value/scale);
    }
    function numberKeys(event,current) {
      event.stopPropagation();
      if(event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if(event.key === 'Escape') { event.preventDefault(); event.currentTarget.value=String(current); setError(''); event.currentTarget.blur(); }
    }
    return e('div', { className: 'bf-inspector' },
      e('nav', { className: 'bf-inspector-tabs', 'aria-label': '片段属性' }, ...[['basic','基础'],['sound','声音'],['speed','变速'],['elements','元素']].map(([key,label]) => e('button', { key, type: 'button', 'aria-pressed': tab === key, onClick: () => setTab(key) }, label))),
      e('div', { className: 'bf-inspector-body' },
        tab === 'sound' || tab === 'speed' ? e('div', { className: 'bf-inspector-form' },
          e('strong', null, props.element.label || '选中片段'),
          media ? tab === 'sound' ? e('label', null, `音量 · ${Math.round(volume*100)}%`, e('input', { type: 'number', min: 0, max: 400, step: 5, disabled:saving, defaultValue: Math.round(volume*100), key: volume,
            'aria-label': '片段音量（百分比）','aria-invalid':Boolean(error), onKeyDown:event=>numberKeys(event,Math.round(volume*100)), onBlur:event=>commitNumber(event.currentTarget,'volume',0,400,100,volume) }))
            : e('label', null, '常规变速', e('input', { type: 'number', min: .1, max: 8, step: .1, disabled:saving, defaultValue: rate, key: rate,
              'aria-label': '片段播放速度','aria-invalid':Boolean(error), onKeyDown:event=>numberKeys(event,rate), onBlur:event=>commitNumber(event.currentTarget,'playback-rate',.1,8,1,rate) }),
              e('span', { className: 'bf-inline' }, '按 Enter 保存，Esc 取消'))
            : e('p', null, '请选择视频或音频片段'),
          error && e('p', { role: 'alert', className: 'bf-inline-error' }, error),
          (saving || saved) && e('p',{role:'status',className:'bf-field-status'},icon(saving?'spinner':'check'),saving?'正在保存…':'已保存'))
          : e(props.native, { ...props, showEditableSections: true })),
    );
  }
  function SelectionHeader(props) {
    runtime = props.bridge;
    const clip = runtime.player.getState().elements.find(clip => (clip.key || clip.id) === runtime.player.getState().selectedElementId);
    return e(props.native, { ...props, name: clip?.label || '选中元素', meta: '' });
  }
  function InspectorFooter(props) {
    runtime = props.bridge;
    return e('div', { className: 'bf-inspector-form' }, e('button', { type: 'button', className: 'bf-header-button', onClick: () => post('assistant', '请帮我修改当前选中的片段。') }, icon('sparkles'), '让创作助手修改'));
  }
  function EmptySelection(props) {
    runtime = props.bridge;
    return e('div', { className: 'bf-media-empty', style: { height: '100%', padding: 24, textAlign: 'center' } }, icon('pointer'),
      e('strong', null, '选择一个片段'), e('p', null, '在时间线或预览画面中选择片段，调整位置、尺寸、声音和速度。'),
      e('button', { type: 'button', onClick: () => post('assistant') }, '打开创作助手'));
  }
  const api = window.__BeeftvEditor = { Toolbar, TrackHeader, Header, Library, Inspector, SelectionHeader, InspectorFooter, EmptySelection, actions: {}, isLocked: locked,
    connect(bridge, setHeight) {
      runtime = bridge; api.player = bridge.player; heightSetter = setHeight; updateHeight(preferences.height || 72);
      // Dock resizing should keep the assistant above the full-width timeline.
      let observed;
      const resize = new ResizeObserver(() => {
        const timeline = document.querySelector('[data-studio-timeline]');
        if (timeline) parent.postMessage({ type: 'beeftv:workspace-layout', editId: config.editId,
          timelineTop: timeline.getBoundingClientRect().top }, config.parentOrigin);
      });
      const observer = new MutationObserver(() => {
        const timeline = document.querySelector('[data-studio-timeline]');
        if (timeline && timeline !== observed) { resize.disconnect(); observed = timeline; resize.observe(timeline); resize.observe(document.body); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },
  };
})();
