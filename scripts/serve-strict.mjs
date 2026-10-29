// Static server that applies the production _headers CSP, so the strict policy can be tested locally.
import http from 'node:http'; import { readFileSync, existsSync, statSync } from 'node:fs'; import { join, extname } from 'node:path';
const root = 'apps/lite/dist'; const port = Number(process.argv[2] ?? 4810);
const hdr = Object.fromEntries(readFileSync(join(root, '_headers'), 'utf8').split('\n').filter((l) => l.startsWith('  ')).map((l) => { const i = l.indexOf(':'); return [l.slice(2, i), l.slice(i + 1).trim()]; }));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
http.createServer((req, res) => { let p = join(root, decodeURIComponent(req.url.split('?')[0])); if (!existsSync(p) || statSync(p).isDirectory()) p = join(root, 'index.html'); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', ...hdr }); res.end(readFileSync(p)); }).listen(port, '127.0.0.1');
