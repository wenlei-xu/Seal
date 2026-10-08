import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createFrozenInputReader, hashFile } from '../hypit-inputs.mjs';

test('frozen result inputs accept physical path aliases but reject outside and changed bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seal frozen input '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'); await fs.mkdir(project);
  const file = path.join(project, 'asset.png'), outside = path.join(root, 'outside.png');
  await fs.writeFile(file, 'known bytes'); await fs.writeFile(outside, 'known bytes');
  const read = await createFrozenInputReader(project, [{ file: 'asset.png', sha256: await hashFile(file) }]);
  const physical = await fs.realpath(file);
  assert.equal((await read(pathToFileURL(physical))).size, 11);
  await assert.rejects(read(pathToFileURL(outside)), /outside frozen/);
  await fs.writeFile(file, 'changed bytes');
  await assert.rejects(read(pathToFileURL(physical)), /input changed/);
});
