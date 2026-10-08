import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export function hypitDistribution() {
  const candidates = process.env.BEEFTV_HYPIT_ROOT ? [process.env.BEEFTV_HYPIT_ROOT]
    : [path.join(here, 'hypit'), path.resolve(here, '../edit-host/hypit'),
      path.resolve(here, '../edit-host/node_modules/@hypit/hypit'), path.resolve(here, '../../hypit')];
  try {
    const resolved = createRequire(import.meta.url).resolve('@hypit/hypit/hyperframes');
    for (let dir = path.dirname(resolved); dir !== path.dirname(dir); dir = path.dirname(dir)) candidates.push(dir);
  } catch { /* A bundled distribution or explicit development checkout may supply Hypit. */ }
  for (const candidate of candidates) {
    try {
      const root = fs.realpathSync(candidate);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (manifest.name !== '@hypit/hypit') continue;
      if (manifest.version !== '0.2.17') throw new Error('Hypit integration requires version 0.2.17');
      if (!fs.existsSync(path.join(root, 'bin/hypit.mjs')) || !fs.existsSync(path.join(root, 'skills/hypit/SKILL.md'))) continue;
      return { root, version: manifest.version, cli: path.join(root, 'bin/hypit.mjs'), skillRoot: path.join(root, 'skills/hypit') };
    } catch (error) { if (error.message.includes('requires version')) throw error; }
  }
  return null;
}
