import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VIDEO_USE_COMMIT = 'b877063835e6ea6e457124da7e28a0ae26691dc3';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

export function verifyCreatorSkills(root) {
  const verified = [];
  for (const name of ['video-use', 'skill-creator']) {
    const directory = path.join(root, name);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'upstream.json'), 'utf8'));
    if (manifest.name !== name || manifest.format !== 'beeftv.vendored-skill@1'
      || name === 'video-use' && manifest.commit !== VIDEO_USE_COMMIT) throw new Error('Builtin Skill source mismatch: ' + name);
    const actual = {};
    function walk(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isSymbolicLink()) throw new Error('Builtin resources must be regular files');
        if (item.isDirectory()) walk(file);
        else actual[path.relative(path.join(directory, 'upstream'), file).replaceAll('\\', '/')] = digest(fs.readFileSync(file));
      }
    }
    walk(path.join(directory, 'upstream'));
    for (const [file, hash] of Object.entries(manifest.files)) if (actual[file] !== hash) throw new Error('Builtin Skill resource changed: ' + name + '/' + file);
    if (Object.keys(actual).length !== Object.keys(manifest.files).length) throw new Error('Unexpected builtin resources');
    if (!actual['SKILL.md'] || !(actual.LICENSE || actual['license.txt'])) throw new Error('Builtin instructions and attribution are required');
    verified.push({ name, files: Object.keys(actual).length, commit: manifest.commit || null });
  }
  return verified;
}

export function vendorCreatorSkills(videoRoot, creatorRoot) {
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: videoRoot, encoding: 'utf8' }).trim() !== VIDEO_USE_COMMIT) throw new Error('Use the pinned Video Use checkout');
  const videoFiles = execFileSync('git', ['ls-files', '-z'], { cwd: videoRoot, encoding: 'utf8' }).split('\0').filter(name => name && !name.startsWith('.') && !name.startsWith('tests/'));
  const creatorFiles = [];
  function list(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name === '__pycache__' || item.name.startsWith('.')) continue;
      const file = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error('Skill source must contain regular files');
      if (item.isDirectory()) list(file); else creatorFiles.push(path.relative(creatorRoot, file).replaceAll('\\', '/'));
    }
  }
  list(creatorRoot);
  for (const [name, source, files, origin, commit] of [
    ['video-use', videoRoot, videoFiles, 'https://github.com/browser-use/video-use', VIDEO_USE_COMMIT],
    ['skill-creator', creatorRoot, creatorFiles, 'OpenAI Codex bundled skill-creator', null],
  ]) {
    const destination = path.join(repo, 'agent-host/skills', name);
    const manifest = { format: 'beeftv.vendored-skill@1', name, origin, commit, files: {} };
    for (const relative of files.sort()) {
      const original = path.join(source, relative), target = path.join(destination, 'upstream', relative);
      if (!fs.lstatSync(original).isFile()) throw new Error('Skill input is not a regular file');
      const bytes = fs.readFileSync(original); manifest.files[relative] = digest(bytes);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(path.join(destination, 'upstream.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  return verifyCreatorSkills(path.join(repo, 'agent-host/skills'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify') console.log(JSON.stringify(verifyCreatorSkills(path.join(repo, 'agent-host/skills'))));
  else console.log(JSON.stringify(vendorCreatorSkills(path.resolve(process.argv[2]), path.resolve(process.argv[3]))));
}
