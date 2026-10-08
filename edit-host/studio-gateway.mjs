import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { openStudio } from './hyperframes.mjs';
import { failure, atomicJson } from './project-store.mjs';
import { prepareRenderSnapshot } from './render-snapshots.mjs';
import { createRenderWorkers } from './render-workers.mjs';
import { nativeExportFile } from './saved-exports.mjs';
import { createReadStream } from 'node:fs';
import { localizeStudioBundle } from './studio-localization.mjs';
import { productStudioBundle } from './studio-product.mjs';
import { addProductText } from './studio-product-source.mjs';
import { parseHTML } from 'linkedom';
import { atomicProjectSource } from './project-store.mjs';
import { ensureHfIds } from './hyperframes.mjs';

const scriptLiteral = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const clientScript = await fs.readFile(new URL('./studio-client.js', import.meta.url), 'utf8');
const productScript = await fs.readFile(new URL('./studio-product-client.js', import.meta.url), 'utf8');
const productStyle = await fs.readFile(new URL('./studio-product.css', import.meta.url), 'utf8');
const productIcons = JSON.parse(await fs.readFile(new URL('./studio-product-icons.json', import.meta.url),'utf8')).icons;
const uiFonts = new Map(await Promise.all(['sans','mono'].map(async name => [`/__beeftv/ui-${name}.woff2`,await fs.readFile(new URL(`./studio-ui-${name}.woff2`,import.meta.url))])));
const constantEqual = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const bytes of req) {
    size += bytes.length;
    if (size > limit) throw failure('body_too_large', 'Request body exceeds limit', 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export function sendError(res, error) {
  const status = error.status || 500;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ code: status, reason: error.reason || 'edit_failed', error: error.message, msg: error.message }));
}

export function createStudioGateway(store) {
  const studios = new Map();
  const opening = new Map();

  async function open(editId) {
    if (studios.has(editId)) return studios.get(editId);
    if (opening.has(editId)) return opening.get(editId);
    const promise = (async () => {
      const state = await store.state(editId);
      await store.recover(editId);
      const studio = openStudio(store.workDir(editId), editId, path.join(store.root, 'history'));
      let activeExport = null;
      const renderWorkers = createRenderWorkers();
      studio.adapter.startRender = options => {
        if (!activeExport) throw failure('export_snapshot_required', 'Render must start through the product snapshot gateway', 409);
        activeExport.nativeFileName = path.basename(options.outputPath);
        return renderWorkers.start(activeExport, options);
      };
      const history = await studio.adapter.history({ id: editId, dir: store.workDir(editId) });
      if (!history) { await studio.shutdown(); throw failure('history_unavailable', 'Studio history could not be opened', 503); }
      const tickets = new Map();
      const sessions = new Map();
      const cookieName = `beeftv_edit_${crypto.randomBytes(12).toString('hex')}`;
      let origin = '';
      const server = http.createServer(async (req, res) => {
        try {
          if (req.headers.host !== new URL(origin).host) throw failure('host_rejected', 'Invalid local host', 403);
          const url = new URL(req.url, origin);
          if (url.pathname === '/__session' && req.method === 'POST') {
            const body = new URLSearchParams((await readBody(req, 8192)).toString());
            const ticket = tickets.get(body.get('ticket'));
            tickets.delete(body.get('ticket'));
            if (!ticket || ticket.expires < Date.now() || req.headers.origin !== ticket.parentOrigin) {
              throw failure('ticket_rejected', 'Editor launch ticket expired or has a different origin', 403);
            }
            const session = crypto.randomBytes(32).toString('hex');
            sessions.set(session, { parentOrigin: ticket.parentOrigin, theme: ticket.theme, expires: Date.now() + 12 * 60 * 60 * 1000 });
            // Native desktop pages are cross-site with the loopback editor. Partition the
            // session by their top-level site; writes still require the editor Origin and CAS.
            const crossSite = new URL(ticket.parentOrigin).hostname !== new URL(origin).hostname;
            const cookiePolicy = crossSite ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Strict';
            res.writeHead(303, { Location: `/#project/${editId}`, 'Set-Cookie': `${cookieName}=${session}; HttpOnly; ${cookiePolicy}; Path=/; Max-Age=43200`, 'Cache-Control': 'no-store' });
            res.end();
            return;
          }
          const cookies = String(req.headers.cookie || '').split(';').map(part => part.trim().split('='));
          const rawSession = cookies.find(([key]) => key === cookieName)?.[1];
          const session = [...sessions.entries()].find(([key]) => constantEqual(key, rawSession))?.[1];
          if (!session || session.expires < Date.now()) throw failure('editor_session_required', 'Open this editor through Seal', 403);
          if (req.headers.origin && req.headers.origin !== origin) throw failure('origin_rejected', 'Cross-origin editor request rejected', 403);
          if (req.method === 'GET' && uiFonts.has(url.pathname)) {
            res.writeHead(200, { 'Content-Type':'font/woff2','Cache-Control':'private, max-age=86400' });
            res.end(uiFonts.get(url.pathname)); return;
          }
          const renderPrefix = `/api/projects/${editId}/renders/file/`;
          if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith(renderPrefix)) {
            const output = await nativeExportFile(store, editId, decodeURIComponent(url.pathname.slice(renderPrefix.length)));
            res.writeHead(200, { 'Content-Type': output.mimeType, 'Content-Length': output.size, 'Cache-Control': 'no-store' });
            if (req.method === 'HEAD') { res.end(); return; }
            const stream = createReadStream(output.file); res.once('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res); return;
          }
          if (url.pathname === '/api/telemetry-identity') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"enabled":false}'); return;
          }
          const bytes = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
          const request = new Request(url, { method: req.method, headers: req.headers, body: bytes, ...(bytes ? { duplex: 'half' } : {}) });
          let response;
          const writing = !['GET', 'HEAD'].includes(req.method) && url.pathname.startsWith('/api/');
          if (writing) {
            const requestKey = crypto.createHash('sha256').update(req.method + url.pathname).update(bytes || '').digest('hex');
            const receipt = await store.transaction(editId, {
              operationId: String(req.headers['x-beeftv-operation'] || ''),
              expectedRevision: Number(req.headers['x-beeftv-edit-revision']), requestKey,
            }, async (_dir, checkpoint) => {
              const rendering = req.method === 'POST' && url.pathname === `/api/projects/${editId}/render`;
              const frozen = rendering ? await prepareRenderSnapshot(store, editId, checkpoint, JSON.parse(bytes.toString() || '{}')) : null;
              activeExport = frozen;
              try {
                if (req.method === 'POST' && url.pathname === '/api/beeftv/add-text') {
                  response = Response.json(await addProductText(store, { history }, editId, JSON.parse(bytes.toString() || '{}')));
                } else if (req.method === 'POST' && url.pathname === '/api/beeftv/composition-size') {
                  const { width, height } = JSON.parse(bytes.toString() || '{}');
                  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
                    || width > 8192 || height > 8192 || width * height > 16_777_216) {
                    throw failure('invalid_composition_size', '画面宽高须为有效整数，且总像素不能超过 1677 万', 400);
                  }
                  const entry = path.join(store.workDir(editId), 'index.html');
                  const { document } = parseHTML(await fs.readFile(entry, 'utf8'));
                  const root = document.querySelector('[data-composition-id="main"]')
                    || document.querySelector('[data-composition-id]');
                  if (!root) throw failure('composition_missing', '工程中没有找到主画面', 409);
                  if (root.getAttribute('data-width') !== String(width) || root.getAttribute('data-height') !== String(height)) {
                    const historyWindow = await history.beginWindow({ kind: 'person', name: 'You' }, '修改画面比例');
                    try {
                      root.setAttribute('data-width', String(width));
                      root.setAttribute('data-height', String(height));
                      await atomicProjectSource(store, editId, 'index.html', ensureHfIds(document.toString()));
                    } finally { await historyWindow.close(); }
                  }
                  response = Response.json({ width, height });
                } else {
                  response = await studio.app.fetch(request);
                }
              }
              finally { activeExport = null; }
              if (!response.ok) {
                const text = await response.text();
                throw failure('studio_mutation_rejected', text.slice(0, 2000), response.status);
              }
              let body = await response.text();
              if (frozen) {
                const result = JSON.parse(body);
                await atomicJson(path.join(frozen.directory, 'job.json'), { jobId: result.jobId, fileName: frozen.nativeFileName, exportId: frozen.manifest.exportId,
                  inputRevision: frozen.manifest.revision, inputHash: frozen.manifest.inputHash });
                body = JSON.stringify({ ...result, exportId: frozen.manifest.exportId, inputRevision: frozen.manifest.revision });
              }
              return { status: response.status, body, headers: Object.fromEntries(response.headers) };
            });
            response = new Response(receipt.result.body, { status: receipt.result.status, headers: receipt.result.headers });
          } else {
            // Source reads stay exclusive. Metadata/thumbnail work can wait on a browser;
            // let it pass the commit barrier without holding the writer lock throughout.
            const sourceRead = url.pathname.startsWith(`/api/projects/${editId}/files/`) || url.pathname === `/api/projects/${editId}/preview`;
            if (url.pathname === '/api/events') response = await studio.app.fetch(request);
            else if (sourceRead) response = await store.locked(editId, () => studio.app.fetch(request));
            else { await store.locked(editId, () => undefined); response = await studio.app.fetch(request); }
          }
          const headers = Object.fromEntries(response.headers);
          headers['X-Beeftv-Edit-Revision'] = String((await store.state(editId)).revision);
          headers['Cache-Control'] = 'no-store';
          if (/^\/assets\/index-[\w-]+\.js$/.test(url.pathname) && headers['content-type']?.includes('javascript')) {
            const script = productStudioBundle(localizeStudioBundle(await response.text()));
            delete headers['content-length']; delete headers.etag;
            res.writeHead(response.status, headers); res.end(script); return;
          }
          if (url.pathname === '/' && headers['content-type']?.includes('text/html')) {
            const config = { editId, projectId: state.projectId, revision: (await store.state(editId)).revision, parentOrigin: session.parentOrigin, theme: session.theme };
            const html = (await response.text()).replace('<head>', `<head><script>window.__BEEFTV_EDIT__=${scriptLiteral(config)};window.__BEEFTV_EDIT_ICONS__=${scriptLiteral(productIcons)};${clientScript}\n${productScript}</script>`)
              .replace('</head>', `<style>${productStyle}</style></head>`);
            delete headers['content-length'];
            res.writeHead(response.status, headers); res.end(html); return;
          }
          res.writeHead(response.status, headers);
          if (!response.body || req.method === 'HEAD') { res.end(); return; }
          const stream = Readable.fromWeb(response.body);
          res.once('close', () => stream.destroy());
          stream.on('error', () => res.destroy());
          stream.pipe(res);
        } catch (error) {
          if (!res.headersSent) sendError(res, error); else res.destroy();
        }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
      const owned = { studio, history, origin, server, renderWorkers,
        async render(input) {
          const options = { format: 'mp4', fps: input.fps ?? 30, quality: input.quality ?? 'standard' };
          if (!Number.isSafeInteger(options.fps) || options.fps < 1 || options.fps > 120
            || !['draft', 'standard', 'high'].includes(options.quality)) throw failure('invalid_export_options', 'Invalid export fps or quality');
          return store.transaction(editId, { operationId: input.operationId, expectedRevision: input.expectedRevision,
            requestKey: crypto.createHash('sha256').update(JSON.stringify({ action: 'hyperframes/export', options })).digest('hex') }, async (_dir, checkpoint) => {
            const frozen = await prepareRenderSnapshot(store, editId, checkpoint, options);
            activeExport = frozen;
            let result;
            try {
              const response = await studio.app.request(`/api/projects/${editId}/render`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) });
              result = await response.json();
              if (!response.ok) throw failure('export_rejected', result.error || 'Native render rejected', response.status);
            } finally { activeExport = null; }
            await atomicJson(path.join(frozen.directory, 'job.json'), { jobId: result.jobId, fileName: frozen.nativeFileName,
              exportId: frozen.manifest.exportId, inputRevision: frozen.manifest.revision, inputHash: frozen.manifest.inputHash });
            return { ...result, exportId: frozen.manifest.exportId, inputRevision: frozen.manifest.revision };
          });
        },
        ticket(parentOrigin, theme = 'dark') {
          const parsed = new URL(parentOrigin);
          if (!['127.0.0.1', 'localhost', '[::1]', 'wails.localhost'].includes(parsed.hostname)) {
            throw failure('origin_rejected', 'Only the local product can open Studio', 403);
          }
          const ticket = crypto.randomBytes(32).toString('hex');
          tickets.set(ticket, { parentOrigin: parsed.origin, theme: theme === 'light' ? 'light' : 'dark', expires: Date.now() + 60_000 });
          return { studioUrl: origin, ticket, editId, projectId: state.projectId, revision: state.revision };
        },
      };
      studios.set(editId, owned);
      return owned;
    })();
    opening.set(editId, promise);
    try { return await promise; } finally { opening.delete(editId); }
  }

  async function close() {
    await Promise.allSettled([...opening.values()]);
    for (const owned of studios.values()) {
      await owned.renderWorkers.close();
      owned.server.closeAllConnections();
      await new Promise(resolve => owned.server.close(resolve));
      owned.studio.watcher.close();
      await owned.studio.shutdown();
    }
    studios.clear();
  }
  return { open, close, busy: () => opening.size + [...studios.values()].reduce((count, owned) => count + owned.renderWorkers.busy(), 0) };
}
