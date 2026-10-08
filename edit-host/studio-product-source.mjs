import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseHTML } from 'linkedom';
import { failure, atomicProjectSource } from './project-store.mjs';
import { ensureHfIds } from './hyperframes.mjs';

export async function addProductText(store, owned, editId, input) {
  const cues = input.cues || [{ text: input.text, start: input.start, duration: input.duration }];
  if (!Array.isArray(cues) || !cues.length || cues.length > 1000) throw failure('invalid_captions', '字幕条数须为 1 至 1000 条', 400);
  for (const cue of cues) {
    if (typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 4000 || !Number.isFinite(cue.start)
      || cue.start < 0 || !Number.isFinite(cue.duration) || cue.duration <= 0 || cue.start + cue.duration > 86400) {
      throw failure('invalid_text', '文字内容和开始、结束时间无效', 400);
    }
  }
  const entry = path.join(store.workDir(editId), 'index.html');
  const { document } = parseHTML(await fs.readFile(entry, 'utf8'));
  const root = document.querySelector('[data-composition-id="main"]') || document.querySelector('[data-composition-id]');
  if (!root) throw failure('composition_missing', '工程中没有找到主画面', 409);
  const clipIds = [];
  const historyWindow = await owned.history.beginWindow({ kind: 'person', name: 'You' }, input.caption ? '添加字幕' : '添加文字');
  try {
    let duration = Number(root.getAttribute('data-duration')) || 0;
    for (const cue of cues) {
      const node = document.createElement('div');
      const id = `text_${crypto.randomUUID().replaceAll('-', '')}`;
      for (const [key, value] of Object.entries({ id, class: 'clip', 'data-start': cue.start, 'data-duration': cue.duration,
        'data-track-index': input.caption ? 40 : 30, 'data-track-kind': input.caption ? 'captions' : 'graphics',
        'data-label': cue.text.trim().slice(0, 80) })) node.setAttribute(key, String(value));
      node.setAttribute('style', `position:absolute;left:8%;width:84%;${input.caption ? 'bottom:8%' : 'top:42%'};text-align:center;color:#fff;font-family:system-ui,sans-serif;font-size:${input.caption ? '40' : '64'}px;line-height:1.3;white-space:pre-wrap;text-shadow:0 2px 8px #0009;z-index:${input.caption ? 40 : 30}`);
      node.textContent = cue.text;
      root.appendChild(node); clipIds.push(id); duration = Math.max(duration, cue.start + cue.duration);
    }
    root.setAttribute('data-duration', String(duration));
    await atomicProjectSource(store, editId, 'index.html', ensureHfIds(document.toString()));
    return { clipIds };
  } finally { await historyWindow.close(); }
}
