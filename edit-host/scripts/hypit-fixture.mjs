// An offline fixture made by the real Hypit compiler, rather than handcrafted equivalent scene HTML.
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function compileHypitFixture(hypitRoot) {
  return (await compileHypitBundle(hypitRoot)).document;
}

export async function compileHypitBundle(hypitRoot, { rich = false } = {}) {
  const root = path.resolve(hypitRoot);
  const require = createRequire(path.join(root, 'package.json'));
  const { register } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
  const unregister = register();
  try {
    const { compileHyperframesDocument, browserProgram } = await import(pathToFileURL(path.join(root, 'packages/hyperframes/src/index.ts')).href);
    const { sealProgramSpace } = await import(pathToFileURL(path.join(root, 'packages/program-space/src/index.ts')).href);
    const { sealComposition, sealVisualTrack, sealAudioTrack } = await import(pathToFileURL(path.join(root, 'packages/composition/src/index.ts')).href);
    const space = sealProgramSpace({ id: 'beeftv-integration', durationSec: 3, frameRate: { numerator: 24, denominator: 1 } });
    const track = sealVisualTrack({ programSpaceId: space.id, visualIr: 'hypit.visual-ir@1', id: 'reference-scene', presents: [{
      id: 'replica', span: { startFrame: 0, endFrameExclusive: 72 }, stacking: { order: 0, tieBreak: 'replica' },
      elements: [{ id: 'motion', order: 0, kind: 'program', style: [{ name: 'width', value: '100%' }, { name: 'height', value: '100%' }],
        program: browserProgram({
          html: '<div class="art"><div class="marker"></div><div class="headline">Hypit scene</div><div class="counter"></div></div>',
          css: '.art{position:absolute;inset:0;background:#152437;color:#ffffff}.marker{position:absolute;left:40px;top:180px;width:64px;height:64px;background:#72edbd;border-radius:16px}.headline{position:absolute;left:32px;top:80px;font-size:30px}.counter{position:absolute;left:40px;top:290px;font-size:24px}',
          setup: 'const marker=root.querySelector(".marker");const counter=root.querySelector(".counter");return frame=>{marker.style.transform="translateX("+(frame*2)+"px)";counter.textContent="Frame "+frame;root.dataset.observedFrame=String(frame);};',
        }),
      }],
    }] });
    const tracks = [track];
    const files = [];
    const resources = [];
    if (rich) {
      const font = await fs.readFile(process.env.BEEFTV_TEST_FONT || 'C:/Windows/Fonts/arial.ttf');
      const fontRef = { kind: 'blob', resource: 'res_fixture:beeftv-font', size: font.length, mediaType: 'font/ttf' };
      files.push({ path: 'assets/font.ttf', base64: font.toString('base64') });
      resources.push({ resource: fontRef.resource, path: 'assets/font.ttf' });
      tracks.push(sealVisualTrack({ programSpaceId: space.id, visualIr: 'hypit.visual-ir@1', id: 'typography', presents: [{
        id: 'title', span: { startFrame: 0, endFrameExclusive: 72 }, stacking: { order: 1, tieBreak: 'title' },
        elements: [{ id: 'title-flow', order: 0, kind: 'text-flow',
          style: [{ name: 'position', value: 'absolute' }, { name: 'left', value: '32px' }, { name: 'top', value: '360px' }, { name: 'width', value: '260px' }, { name: 'height', value: '80px' }],
          document: { paragraphs: [{ id: 'title', inlines: [{ kind: 'text', id: 'words', text: 'AI' }] }] },
          typography: { fonts: [{ sources: [{ artifact: fontRef }], weight: 400, style: 'normal' }], sizePx: 40, weight: 400,
            style: 'normal', axes: [], features: [], synthesis: 'none', kerning: 'auto', trackingPx: 0, wordSpacingPx: 0,
            lineHeight: 1, direction: 'auto', writingMode: 'horizontal-tb', baselineShiftPx: 0, tabSize: 4, indentationPx: 0,
            paragraphBeforePx: 0, paragraphAfterPx: 0, transform: 'none', variantCaps: 'normal', verticalAlign: 'baseline',
            decorations: [], cjk: { textSpacing: 'normal', punctuationTrim: 'none' } },
          paints: [{ kind: 'fill', paint: { kind: 'solid', color: '#ffffff' } }],
          flow: { form: { kind: 'area' }, inlineSize: 'fixed', blockSize: 'fixed', paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
            inlineAlign: 'start', blockAlign: 'start', wrap: 'none', overflow: 'visible', clipToFrame: false,
            columns: 1, columnGapPx: 0, metricEdge: 'line-box' },
          sequences: [{ id: 'letters', unit: 'grapheme', range: { start: 0, endExclusive: 2 }, order: 'forward', startFrame: 0, staggerFrames: 2,
            unitDurationFrames: 24, cycles: 1, keyframes: [{ atProgress: 0, style: [{ name: 'opacity', value: 0 }] }, { atProgress: 1, style: [{ name: 'opacity', value: 1 }] }] }],
        }],
      }] }));
      const samples = 3 * 48000;
      const sound = Buffer.alloc(44 + samples * 2);
      sound.write('RIFF', 0); sound.writeUInt32LE(sound.length - 8, 4); sound.write('WAVEfmt ', 8);
      sound.writeUInt32LE(16, 16); sound.writeUInt16LE(1, 20); sound.writeUInt16LE(1, 22);
      sound.writeUInt32LE(48000, 24); sound.writeUInt32LE(96000, 28); sound.writeUInt16LE(2, 32); sound.writeUInt16LE(16, 34);
      sound.write('data', 36); sound.writeUInt32LE(samples * 2, 40);
      for (let frame = 0; frame < samples; frame++) sound.writeInt16LE(Math.round(Math.sin(frame * 2 * Math.PI * 440 / 48000) * 8000), 44 + frame * 2);
      const audioRef = { kind: 'blob', resource: 'res_fixture:beeftv-audio', size: sound.length, mediaType: 'audio/wav' };
      files.push({ path: 'assets/tone.wav', base64: sound.toString('base64') });
      resources.push({ resource: audioRef.resource, path: 'assets/tone.wav' });
      tracks.push(sealAudioTrack({ programSpaceId: space.id, id: 'sound', clips: [{ id: 'tone', artifact: audioRef,
        target: { startSample: 0, endSampleExclusive: samples }, source: { sampleFrames: samples, startSample: 0, endSampleExclusive: samples, loop: false, phaseSample: 0 },
        playbackRate: 1, pitch: 'preserve', gain: 1, fadeInSamples: 0, fadeOutSamples: 0 }] }));
    }
    return { document: compileHyperframesDocument(sealComposition({ id: 'hypit-original', canvas: { width: 320, height: 480, clearColor: '#152437' }, tracks }), space), audioTracks: tracks.filter(track => track.kind === 'audio'), files, resources };
  } finally { unregister(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'))) {
  const document = await compileHypitFixture(process.argv[2]);
  await fs.writeFile(process.argv[3], JSON.stringify(document));
}
