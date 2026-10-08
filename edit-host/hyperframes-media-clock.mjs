// Correct nested source in-points in the pinned HyperFrames collector. Its
// original host-window semantics are Apache-2.0 (see the bundled LICENSE).
export function nestedCompositionInpoint(element, basis) {
  if (String(basis || 'local').trim().toLowerCase() === 'global') return 0;
  let offset = 0;
  for (let host = element.parentElement; host; host = host.parentElement) {
    if (!host.hasAttribute('data-composition-src') && !host.hasAttribute('data-composition-file')) continue;
    const value = Number(host.getAttribute('data-playback-start') ?? host.getAttribute('data-media-start') ?? 0);
    if (Number.isFinite(value) && value > 0) offset += value;
  }
  return offset;
}

export function collectClockedRenderMedia(html, api) {
  const { document } = api.parseHTML(html);
  const starts = new Map(), visiting = new Set(), windows = new Map();
  for (const element of document.querySelectorAll(`[${api.MEDIA_RENDER_ID_ATTR}]`)) {
    const hosts = [];
    for (let host = element.parentElement; host; host = host.parentElement) if (host.hasAttribute('data-composition-file')) hosts.push(host);
    let offset = 0, begin = 0, limit = Infinity;
    for (const host of hosts.reverse()) {
      const start = api.resolveReferencedStart(document, host, starts, visiting);
      const end = api.resolveHostEnd(host, start);
      begin = Math.max(begin, offset + start);
      if (end !== null) limit = Math.min(limit, offset + end);
      const inpoint = Number(host.getAttribute('data-playback-start') ?? host.getAttribute('data-media-start') ?? 0);
      offset += start - (Number.isFinite(inpoint) && inpoint > 0 ? inpoint : 0);
    }
    windows.set(element.getAttribute(api.MEDIA_RENDER_ID_ATTR), { offset, begin, limit,
      basis: api.readMediaStartBasis(element.getAttribute(api.MEDIA_START_BASIS_ATTR)) });
  }
  const root = { offset: 0, begin: 0, limit: Infinity, basis: 'local' };
  function project(media, id, end) {
    const window = windows.get(id) || root;
    const rawStart = window.basis === 'global' ? media.start : window.offset + media.start;
    const rawEnd = window.basis === 'global' ? end : window.offset + end;
    const start = Math.max(window.begin, rawStart), finish = Math.min(window.limit, rawEnd);
    if (finish <= start) return null;
    const crop = Math.max(0, start - rawStart);
    const shift = media.mediaStart === undefined ? {} : { mediaStart: media.mediaStart + api.sourceTimeAt(media.playbackRate ?? 1, crop) };
    return { ...media, ...shift, start, end: Number.isFinite(finish) ? finish : 0,
      ...(crop > 0 ? { automationOffset: crop } : {}) };
  }
  const videos = api.parseVideoElements(html).map(media => project(media, media.id, media.end > media.start ? media.end : Infinity)).filter(Boolean);
  const images = api.parseImageElements(html).map(media => project(media, media.id, media.end)).filter(Boolean);
  const audios = api.parseAudioElements(html).map(media => project(media,
    media.type === 'video' ? media.id.replace(/-audio$/, '') : media.id, media.end > 0 ? media.end : Infinity)).filter(Boolean);
  return { videos, audios, images };
}

export function shiftedVolumeKeyframes(lane, start, duration, offset, sample) {
  const out = [];
  const count = Math.max(1, Math.ceil(duration * 30));
  for (let i = 0; i <= count; i++) {
    const t = duration * i / count;
    out.push({ time: start + t, volume: sample(lane, offset + t) });
  }
  return out;
}
