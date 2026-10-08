import crypto from 'node:crypto';
import { parseHTML } from 'linkedom';
import { failure } from './project-store.mjs';

// Hypit's HyperFrames compiler emits visual tracks only. Audio remains a
// 48 kHz sample-domain handoff and must join the same editable scene explicitly.
export function attachHypitAudio(value, tracks = []) {
  if (!tracks.length) return value;
  const { document } = parseHTML(value.html);
  const root = document.querySelector('[data-composition-id]');
  if (!root) throw failure('master_missing', 'Hypit scene root is missing');
  const totalSamples = Math.round(value.frameCount * value.frameRate.denominator / value.frameRate.numerator * 48000);
  const artifacts = new Map((value.artifacts || []).map(entry => [entry.artifact.resource, entry]));
  const keys = new Set();
  tracks.forEach((track, trackIndex) => {
    if (track.kind !== 'audio' || typeof track.id !== 'string' || !Array.isArray(track.clips)) throw failure('invalid_audio', 'A sealed Hypit AudioTrack is required');
    for (const clip of track.clips) {
      const key = `${track.id}/${clip.id}`;
      if (keys.has(key)) throw failure('duplicate_audio', 'Scene audio clip identity is duplicated');
      keys.add(key);
      const { artifact, target, source, playbackRate, gain, pitch, fadeInSamples, fadeOutSamples } = clip;
      const positions = [target?.startSample, target?.endSampleExclusive, source?.sampleFrames, source?.startSample,
        source?.endSampleExclusive, source?.phaseSample, fadeInSamples, fadeOutSamples];
      if (!positions.every(n => Number.isSafeInteger(n) && n >= 0) || target.endSampleExclusive <= target.startSample
        || target.endSampleExclusive > totalSamples || source.endSampleExclusive <= source.startSample
        || source.endSampleExclusive > source.sampleFrames || !Number.isFinite(playbackRate) || playbackRate < 0.1 || playbackRate > 10
        || pitch !== 'preserve' || !Number.isFinite(gain) || gain < 0 || gain > 64
        || artifact?.kind !== 'blob' || artifact.mediaType !== 'audio/wav') throw failure('invalid_audio', 'Audio sample mapping is invalid');
      const samples = target.endSampleExclusive - target.startSample;
      if (source.loop || source.phaseSample !== 0 || samples * playbackRate > source.endSampleExclusive - source.startSample + 1
        || fadeInSamples + fadeOutSamples > samples || clip.presentation) {
        throw failure('audio_materialization_required', 'This audio mapping requires a Hypit-rendered WAV stem before import');
      }
      const existing = artifacts.get(artifact.resource);
      if (existing && JSON.stringify(existing.artifact) !== JSON.stringify(artifact)) throw failure('resource_changed', 'Audio and visual tracks disagree about resource bytes');
      artifacts.set(artifact.resource, { artifact, usage: { kind: 'always' } });
      const element = document.createElement('audio');
      const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
      const duration = samples / 48000;
      for (const [name, setting] of Object.entries({ id: `hypit_audio_${id}`, class: 'clip', src: `hypit-resource://${artifact.resource}`,
        'data-start': target.startSample / 48000, 'data-duration': duration, 'data-media-start': source.startSample / 48000,
        'data-playback-rate': playbackRate, 'data-volume': gain, 'data-track-index': trackIndex + 20,
        'data-beeftv-audio-key': key })) element.setAttribute(name, String(setting));
      if (fadeInSamples || fadeOutSamples) {
        const fades = new Map([[0, fadeInSamples ? 0 : 1], [duration, fadeOutSamples ? 0 : 1]]);
        if (fadeInSamples) fades.set(fadeInSamples / 48000, 1);
        if (fadeOutSamples) fades.set((samples - fadeOutSamples) / 48000, 1);
        element.setAttribute('data-automation', JSON.stringify({ version: 1, lanes: [{ target: 'volume',
          points: [...fades].sort(([a], [b]) => a - b).map(([t, v]) => ({ t, v: v * gain })) }] }));
      }
      root.appendChild(element);
    }
  });
  return { ...value, html: document.toString(), artifacts: [...artifacts.values()] };
}
