import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proof = path.join(repo, '.local/cache/hyperframes-proof');
const lock = fs.readFileSync(path.join(repo, 'edit-host/bun.lock'), 'utf8');
const record = lock.split('\n').find(line => line.includes('"hyperframes": ["hyperframes@0.8.130"'));
const expected = record?.match(/sha512-[A-Za-z0-9+/=]+/)?.[0];
const actual = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(path.join(proof, 'hyperframes-0.8.130.tgz'))).digest('base64');
if (!expected || actual !== expected) throw new Error('Original npm tarball does not match the frozen integrity');
const original = path.join(proof, 'original-hyperframes/package');
const require = createRequire(path.join(repo, 'edit-host/package.json'));
const modified = path.dirname(require.resolve('hyperframes/package.json'));
if (JSON.parse(fs.readFileSync(path.join(original, 'package.json'))).version !== '0.8.130') throw new Error('Wrong original version');
const files = ['dist/studioServer-SHKVERJG.js', 'dist/chunk-ZMXUQLI2.js', 'dist/chunk-K2FTXJYH.js',
  'dist/chunk-HWKCIWQT.js', 'dist/hyperframe-runtime.js', 'dist/hyperframe.runtime.iife.js', 'dist/hyperframe.manifest.json'];
const stage = path.join(proof, 'patch-' + crypto.randomUUID());
for (const [directory, source] of [['a', original], ['b', modified]]) {
  for (const file of files) {
    const target = path.join(stage, directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(source, file), target);
  }
}
const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--binary', '--', 'a', 'b'],
  { cwd: stage, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
if (diff.status !== 1 || !diff.stdout) throw new Error('Expected a non-empty pinned patch: ' + diff.stderr);
const patch = diff.stdout.replace(/^diff --git a\/a\/(.*?) b\/b\/(.*?)$/gm, 'diff --git a/$1 b/$2')
  .replace(/^--- a\/a\//gm, '--- a/').replace(/^\+\+\+ b\/b\//gm, '+++ b/');
fs.writeFileSync(path.join(repo, 'edit-host/patches/hyperframes@0.8.130.patch'), patch);
console.log(JSON.stringify({ version: '0.8.130', files: files.length, patchBytes: Buffer.byteLength(patch), originalIntegrityVerified: true }));
