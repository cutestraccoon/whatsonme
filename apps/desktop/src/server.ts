import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAll, type ParseResult, type Event } from './core.ts';
import { detectSources } from './sources.ts';
import { collectBrowserHistory, detectBrowserDbs } from './collectors/browser.ts';
import { collectAppleHealth } from './collectors/health.ts';
import { openLocalArchive } from './collectors/archive.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as { version: string };
export const VERSION: string = pkg.version;
export const MAX_EVENTS = 300_000;
const MAX_BODY = 1024 * 1024;

const LITE_DIST = path.resolve(here, '..', '..', 'lite', 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json',
};

const PLACEHOLDER = `<!doctype html><meta charset="utf-8"><title>Big Brother Desktop</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>Big Brother Desktop</h1><p>The web UI has not been built yet. From the repo root, run <code>npm run build</code> first, then restart.</p>
<p>The local API is up: <a href="/api/ping">/api/ping</a>, <a href="/api/sources">/api/sources</a>, <a href="/api/netcheck">/api/netcheck</a>.</p>
<p>Nothing leaves this machine. This server only listens on 127.0.0.1.</p></body>`;

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function json(res: http.ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(s);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let n = 0;
    req.on('data', (c: Buffer) => { n += c.length; if (n > MAX_BODY) { reject(new HttpError(413, 'body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'invalid JSON')); } });
    req.on('error', reject);
  });
}

/** DNS-rebinding protection: only accept requests addressed to the loopback host. */
export function hostAllowed(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

/** Paths handed to /api/import or found via detection must stay inside the home directory (or the Windows drive under WSL). */
export function pathAllowed(p: string, home = os.homedir()): boolean {
  const real = (() => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } })();
  const realHome = (() => { try { return fs.realpathSync(home); } catch { return path.resolve(home); } })(); // home itself may be a symlink
  const inside = (root: string) => { const rel = path.relative(root, real); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
  if (inside(home) || inside(realHome)) return true;
  if (process.platform === 'linux' && real.startsWith('/mnt/') && /^\/mnt\/[a-z]\/users\//i.test(real)) return true; // WSL: /mnt/c/Users/<me>/...
  return false;
}

/** Keep the JSON response bounded: evenly sample when a collector yields more than MAX_EVENTS. */
export function capEvents(r: ParseResult, max = MAX_EVENTS): ParseResult {
  if (r.events.length <= max) return r;
  const total = r.events.length; const step = total / max;
  const sampled: Event[] = []; for (let i = 0; i < max; i++) sampled.push(r.events[Math.floor(i * step)]);
  return { ...r, events: sampled, warnings: [...r.warnings, `sampled: kept ${max.toLocaleString()} of ${total.toLocaleString()} events (every ~${step.toFixed(1)}th) to keep the response bounded.`] };
}

async function collect(id: string): Promise<ParseResult> {
  const [kind, ...rest] = id.split(':'); const p = rest.join(':');
  if (!p || !pathAllowed(p)) throw new HttpError(400, 'path must be inside your home directory');
  if (!fs.existsSync(p)) throw new HttpError(404, 'not found: ' + p);
  if (kind === 'browser') {
    const known = detectBrowserDbs().find((d) => d.path === p);
    return collectBrowserHistory(p, known ? { browser: known.browser, family: known.family } : {});
  }
  if (kind === 'archive') {
    const base = path.basename(p).toLowerCase();
    if (/^apple_health_export|^export\.xml$/.test(base)) return collectAppleHealth(p);
    const { archive } = await openLocalArchive(p);
    const results = await parseAll(archive);
    if (results.length === 1) return results[0];
    const merged: ParseResult = { source: results[0]?.source ?? 'unknown', events: [], claims: [], files: [], warnings: [] };
    for (const r of results) { merged.events.push(...r.events); merged.claims.push(...r.claims); merged.files.push(...r.files); merged.warnings.push(...r.warnings); }
    if (!results.length) merged.warnings.push('No known export format detected in ' + base);
    return merged;
  }
  throw new HttpError(400, 'unknown source id');
}

async function importPath(p: string): Promise<ParseResult[]> {
  if (typeof p !== 'string' || !p) throw new HttpError(400, 'path required');
  if (!pathAllowed(p)) throw new HttpError(403, 'path must be inside your home directory');
  if (!fs.existsSync(p)) throw new HttpError(404, 'not found: ' + p);
  const { archive, mode } = await openLocalArchive(p);
  const results = await parseAll(archive);
  return results.map((r) => capEvents({ ...r, warnings: [...r.warnings, `imported via ${mode}: ${p}`] }));
}

function serveStatic(urlPath: string, res: http.ServerResponse) {
  if (!fs.existsSync(path.join(LITE_DIST, 'index.html'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PLACEHOLDER); return;
  }
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(LITE_DIST, '.' + rel);
  if (!file.startsWith(LITE_DIST + path.sep) && file !== LITE_DIST) { res.writeHead(403); res.end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(LITE_DIST, 'index.html'); // SPA fallback
  if (target.endsWith('index.html')) { // the web build forbids all network; here the page must reach this loopback server
    const html = fs.readFileSync(target, 'utf8').replace("connect-src 'none'", "connect-src 'self' http://127.0.0.1:* http://localhost:*");
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(html); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(target).pipe(res);
}

/** A web page on another origin can still fire a no-cors POST at loopback; refuse those side effects. */
export function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true; // same-origin navigations, curl, fetch from Node
  try { return hostAllowed(new URL(origin).host); } catch { return false; }
}

export async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!hostAllowed(req.headers.host)) { json(res, 403, { error: 'forbidden host' }); return; }
  if (req.method === 'POST' && !originAllowed(req.headers.origin)) { json(res, 403, { error: 'forbidden origin' }); return; }
  const url = req.url ?? '/';
  const route = url.split('?')[0];
  try {
    if (route.startsWith('/api/')) {
      if (req.method === 'GET' && route === '/api/ping') return json(res, 200, { desktop: true, version: VERSION, platform: process.platform, home: os.homedir() });
      if (req.method === 'GET' && route === '/api/netcheck') return json(res, 200, { outbound: false, bytesOut: 0, listen: '127.0.0.1' });
      if (req.method === 'GET' && route === '/api/sources') return json(res, 200, detectSources());
      if (req.method === 'POST' && route === '/api/collect') {
        const body = (await readBody(req)) as { id?: string };
        if (!body.id) throw new HttpError(400, 'id required');
        return json(res, 200, capEvents(await collect(body.id)));
      }
      if (req.method === 'POST' && route === '/api/import') {
        const body = (await readBody(req)) as { path?: string };
        return json(res, 200, await importPath(body.path ?? ''));
      }
      return json(res, 404, { error: 'no such endpoint' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(url, res);
  } catch (e) {
    const err = e as HttpError;
    json(res, err.status ?? 500, { error: err.message ?? String(e) });
  }
}

export function createServer() { return http.createServer((req, res) => { void handle(req, res); }); }

export function listen(port = Number(process.env.PORT) || 4747): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];
  try { const c = spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch { /* best effort */ }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  listen().then(({ port }) => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Big Brother Desktop → ${url}`);
    if (!process.env.BB_NO_OPEN) openBrowser(url);
  }).catch((e) => { console.error('could not start:', (e as Error).message); process.exit(1); });
}
