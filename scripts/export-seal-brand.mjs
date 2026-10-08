import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SEAL_SHARP_MODULE || 'sharp');
const source = process.argv[2];
if (!source) throw new Error('Pass the approved black-background Seal logo sheet');
const repo = path.resolve(import.meta.dirname, '..');
const output = path.join(repo, 'assets', 'seal');
await fs.mkdir(output, { recursive: true });

// Export the approved lower lockup to editable outlines; no font substitution.
async function outline(box) {
  const { data, info } = await sharp(source).extract(box).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] > 128;
  const edges = new Map();
  const key = (x, y) => `${x},${y}`;
  const edge = (x, y, a, b) => { const k = key(x, y); const list = edges.get(k) || []; list.push([a, b]); edges.set(k, list); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (on(x, y)) {
    if (!on(x, y - 1)) edge(x, y, x + 1, y);
    if (!on(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!on(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!on(x - 1, y)) edge(x, y + 1, x, y);
  }
  const contours = [];
  while (edges.size) {
    const start = edges.keys().next().value.split(',').map(Number);
    let current = start; const points = [];
    do {
      points.push(current);
      const k = key(...current), next = edges.get(k);
      if (!next?.length) throw new Error('Open outline');
      current = next.pop(); if (!next.length) edges.delete(k);
    } while (key(...current) !== key(...start));
    const area = Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
    if (area < 8) continue;
    // Remove collinear pixel edges without changing the approved silhouette.
    const reduced = points.filter((p, i) => { const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]); });
    contours.push(`M${reduced.map(p => p.join(' ')).join('L')}Z`);
  }
  return { width, height, d: contours.join('') };
}
const mark = await outline({ left: 128, top: 790, width: 600, height: 300 });
const word = await outline({ left: 730, top: 865, width: 410, height: 200 });
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
const shape = (item, fill) => `<path fill="${fill}" fill-rule="evenodd" d="${item.d}"/>`;
for (const [suffix, fill] of [['white', '#ffffff'], ['black', '#000000']]) {
  const markSVG = svg(mark.width, mark.height, shape(mark, fill));
  const wordSVG = svg(word.width, word.height, shape(word, fill));
  const lockupSVG = svg(1060, 300, `${shape(mark, fill)}<g transform="translate(650 75)">${shape(word, fill)}</g>`);
  for (const [name, value] of [['mark', markSVG], ['wordmark', wordSVG], ['lockup', lockupSVG]]) {
    await fs.writeFile(path.join(output, `${name}-${suffix}.svg`), value);
    await sharp(Buffer.from(value)).resize({ width: name === 'lockup' ? 1590 : 900 }).png().toFile(path.join(output, `${name}-${suffix}.png`));
  }
}
const iconSVG = svg(512, 512, `<rect width="512" height="512" rx="108" fill="#000000"/><g transform="translate(48 142) scale(.682)">${shape(mark, '#ffffff')}</g>`);
await fs.writeFile(path.join(output, 'app-icon.svg'), iconSVG);
await sharp(Buffer.from(iconSVG)).resize(1024, 1024).png().toFile(path.join(output, 'app-icon.png'));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(iconSVG)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + images.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((bytes, i) => { const at = 6 + i * 16; header[at] = header[at + 1] = sizes[i] === 256 ? 0 : sizes[i]; header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(bytes.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += bytes.length; });
await fs.writeFile(path.join(output, 'app-icon.ico'), Buffer.concat([header, ...images]));
const publicDir = path.join(repo, 'web', 'public', 'brand'); await fs.mkdir(publicDir, { recursive: true });
for (const name of await fs.readdir(output)) if (/\.(svg|png|ico)$/.test(name)) await fs.copyFile(path.join(output, name), path.join(publicDir, `seal-${name}`));
for (const [destination, name] of [['assets/app-icon.svg', 'app-icon.svg'], ['assets/app-icon.png', 'app-icon.png'], ['backend/cmd/desktop/build/appicon.png', 'app-icon.png'], ['backend/cmd/desktop/build/windows/icon.ico', 'app-icon.ico']]) {
  await fs.copyFile(path.join(output, name), path.join(repo, destination));
}
console.log('Exported Seal outlines, transparent logos and desktop icons');
