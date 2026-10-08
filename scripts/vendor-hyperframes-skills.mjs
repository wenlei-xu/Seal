import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HYPERFRAMES_VERSION, HYPERFRAMES_COMMIT, officialSkillFiles, verifyHyperframesSkills } from './verify-hyperframes-skills.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(repo, '.local/cache/hf-source-0.8.130-6791ea58'));
const revision = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
if (revision.status !== 0 || revision.stdout.trim() !== HYPERFRAMES_COMMIT) throw new Error('Vendor only the exact CLI gitHead checkout');
const root = path.join(repo, 'agent-host/skills/hyperframes');
const official = path.join(root, 'official');
fs.mkdirSync(official, { recursive: true });
fs.cpSync(path.join(source, 'skills'), path.join(official, 'skills'), { recursive: true });
for (const file of ['LICENSE', 'CREDITS.md']) fs.copyFileSync(path.join(source, file), path.join(official, file));
fs.writeFileSync(path.join(root, 'upstream.json'), JSON.stringify({ cliVersion: HYPERFRAMES_VERSION, commit: HYPERFRAMES_COMMIT,
  repository: 'https://github.com/heygen-com/hyperframes', files: officialSkillFiles(official) }, null, 2) + '\n');
console.log(JSON.stringify(verifyHyperframesSkills(root)));
