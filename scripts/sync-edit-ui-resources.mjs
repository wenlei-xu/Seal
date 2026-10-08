import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root,'web/package.json'));
const lucide = path.dirname(require.resolve('lucide-react/package.json'));
const mapping = {
  plus:'plus', pointer:'mouse-pointer-2', undo:'undo-2', redo:'redo-2', scissors:'scissors',
  left:'arrow-left-to-line', right:'arrow-right-to-line', trash:'trash-2', ripple:'fold-horizontal',
  audio:'music-2', speed:'gauge', freeze:'square-pause', flag:'flag', sparkles:'sparkles',
  magnet:'magnet', link:'link-2', fit:'scan-line', minus:'minus', more:'ellipsis', lock:'lock-keyhole',
  unlock:'lock-keyhole-open', eye:'eye', 'eye-off':'eye-off', mute:'volume-x', volume:'volume-2',
  film:'film', type:'type', captions:'captions', search:'search', folder:'folder-open',
  upload:'upload', download:'download', wave:'audio-lines', 'wave-small':'chart-no-axes-column-decreasing',
  'wave-medium':'chart-no-axes-column', 'wave-large':'audio-lines', close:'x', spinner:'loader-circle',
  check:'check', pencil:'pencil', info:'info', chevron:'chevron-down',
};
const icons = {};
for (const [key,name] of Object.entries(mapping)) {
  const { __iconNode } = await import(pathToFileURL(path.join(lucide,'dist/esm/icons',`${name}.mjs`)));
  if (!Array.isArray(__iconNode)) throw new Error(`Icon nodes missing: ${name}`);
  icons[key]=__iconNode;
}
const version = JSON.parse(await fs.readFile(path.join(lucide,'package.json'),'utf8')).version;
await fs.writeFile(path.join(root,'edit-host/studio-product-icons.json'),JSON.stringify({source:'lucide-react',version,license:'ISC',icons},null,2)+'\n');
await fs.copyFile(path.join(lucide,'LICENSE'),path.join(root,'edit-host/studio-icons-LICENSE.txt'));
for (const [family,target] of [['inter','sans'],['jetbrains-mono','mono']]) {
  const directory=path.dirname(require.resolve(`@fontsource-variable/${family}/package.json`));
  await fs.copyFile(path.join(directory,'files',`${family}-latin-wght-normal.woff2`),path.join(root,`edit-host/studio-ui-${target}.woff2`));
  await fs.copyFile(path.join(directory,'LICENSE'),path.join(root,`edit-host/studio-font-${target}-LICENSE.txt`));
}
console.log(`Synced ${Object.keys(icons).length} Lucide icons and upright UI fonts.`);
