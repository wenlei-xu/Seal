import fs from 'node:fs/promises';
import path from 'node:path';
import { createProjectStore } from '../project-store.mjs';
import { initializeProject } from '../starter.mjs';
import { createStudioGateway } from '../studio-gateway.mjs';
import { createHypitScenes } from '../hypit-scenes.mjs';
import { compileHypitFixture } from './hypit-fixture.mjs';

const root = path.resolve(process.argv[2]);
const store = createProjectStore(root);
const state = await store.ensure('integration_hypit');
await initializeProject(store.workDir(state.editId));
const gateway = createStudioGateway(store);
try {
  const scenes = createHypitScenes(store, gateway);
  const document = await compileHypitFixture(process.argv[3]);
  const candidate = await scenes.create(state.editId, { document, baseRevision: state.revision, logicalKey: 'reference_intro' });
  const receipt = await scenes.promote(state.editId, { candidateId: candidate.candidateId, operationId: `import_${candidate.candidateId}`, start: 0, track: 0 });
  const owned = await gateway.open(state.editId);
  const bundled = await owned.studio.adapter.bundle(store.workDir(state.editId));
  if (!bundled?.includes('seekListeners')) throw new Error('Native composition bundle did not include the Hypit local clock');
  await fs.writeFile(path.join(root, 'bundle.html'), bundled);
  await fs.writeFile(path.join(root, 'verification.json'), JSON.stringify({ editId: state.editId, candidate, receipt, projectDir: store.workDir(state.editId) }, null, 2));
  console.log(JSON.stringify({ projectDir: store.workDir(state.editId), sceneId: candidate.sceneId, revision: receipt.revision }));
} finally { await gateway.close(); }
