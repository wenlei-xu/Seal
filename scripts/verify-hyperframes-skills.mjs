import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HYPERFRAMES_VERSION = '0.8.130';
export const HYPERFRAMES_COMMIT = '6791ea580c811fe3f1a532a2ced4bbed29008ee7';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function officialSkillFiles(root) {
  const files = {};
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      const target = path.join(dir, entry.name);
      if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Official skill resources cannot contain links');
      if (entry.isDirectory()) walk(target, `${name}/`);
      else if (entry.isFile()) files[name] = digest(fs.readFileSync(target));
      else throw new Error('Unexpected official resource');
    }
  }
  walk(root);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

export function verifyHyperframesSkills(skillRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(skillRoot, 'upstream.json'), 'utf8'));
  if (manifest.cliVersion !== HYPERFRAMES_VERSION || manifest.commit !== HYPERFRAMES_COMMIT) throw new Error('HyperFrames skill/CLI pin mismatch');
  const entry = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  if (!entry.includes(`version: ${HYPERFRAMES_VERSION}`) || !entry.includes(HYPERFRAMES_COMMIT)) throw new Error('HyperFrames product entry is not pinned');
  const actual = officialSkillFiles(path.join(skillRoot, 'official'));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Pinned official skill resources changed or are incomplete');
  const skills = Object.keys(actual).filter(name => /^skills\/[^/]+\/SKILL.md$/.test(name));
  if (skills.length !== 21 || !actual.LICENSE || !actual['CREDITS.md']) throw new Error('Full official suite and attribution are required');
  return { cliVersion: manifest.cliVersion, commit: manifest.commit, skills: skills.length, files: Object.keys(actual).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../agent-host/skills/hyperframes');
  console.log(JSON.stringify(verifyHyperframesSkills(root)));
}
