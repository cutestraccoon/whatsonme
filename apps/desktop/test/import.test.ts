import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { parseAll } from '../src/core.ts';
import { FolderArchive } from '../src/collectors/folder.ts';
import { listen, hostAllowed, pathAllowed, capEvents } from '../src/server.ts';

const LIKED = { likes_media_likes: [{ title: 'someone', string_list_data: [{ href: 'https://instagram.com/p/x', value: '👍', timestamp: 1710000000 }] }] };

let dir: string; let server: http.Server; let base: string;

beforeAll(async () => {
  // must live inside the home dir: /api/import refuses anything else
  dir = fs.mkdtempSync(path.join(os.homedir(), '.bb-import-test-'));
  const sub = path.join(dir, 'Your Instagram Activity', 'Likes');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'liked_posts.json'), JSON.stringify(LIKED));
  fs.writeFileSync(path.join(dir, 'photo.jpg'), Buffer.from([0xff, 0xd8]));
  const l = await listen(0);
  server = l.server; base = `http://127.0.0.1:${l.port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });

describe('FolderArchive', () => {
  it('lists lower-cased relative paths and reads text', async () => {
    const a = new FolderArchive(dir);
    expect(a.list()).toEqual(['your instagram activity/likes/liked_posts.json']); // jpg filtered out
    expect(a.size('Your Instagram Activity/Likes/liked_posts.json')).toBeGreaterThan(0);
    expect(JSON.parse(await a.text('your instagram activity/likes/liked_posts.json'))).toEqual(LIKED);
    const results = await parseAll(a);
    expect(results.map((r) => r.source)).toEqual(['instagram']);
    expect(results[0].events).toHaveLength(1);
    expect(results[0].events[0]).toMatchObject({ kind: 'like', ts: 1710000000000, actor: 'someone', url: 'https://instagram.com/p/x' });
  });
});

describe('HTTP API', () => {
  it('ping and netcheck', async () => {
    const ping = await (await fetch(base + '/api/ping')).json() as Record<string, unknown>;
    expect(ping.desktop).toBe(true); expect(ping.home).toBe(os.homedir());
    const net = await (await fetch(base + '/api/netcheck')).json() as Record<string, unknown>;
    expect(net.outbound).toBe(false);
  });
  it('rejects foreign Host headers (DNS rebinding) and sets no CORS headers', async () => {
    // fetch() drops a custom Host header, so use raw http for this one
    const status = await new Promise<number>((resolve, reject) => {
      const port = (server.address() as { port: number }).port;
      http.get({ host: '127.0.0.1', port, path: '/api/ping', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on('error', reject);
    });
    expect(status).toBe(403);
    const ok = await fetch(base + '/api/ping', { headers: { Origin: 'https://evil.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBeNull();
    expect(hostAllowed('localhost:4747')).toBe(true); expect(hostAllowed('192.168.1.5:4747')).toBe(false);
  });
  it('imports a folder and returns 1 instagram like', async () => {
    const r = await fetch(base + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: dir }) });
    expect(r.status).toBe(200);
    const results = await r.json() as { source: string; events: { kind: string; ts: number }[] }[];
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('instagram');
    expect(results[0].events).toHaveLength(1);
    expect(results[0].events[0]).toMatchObject({ kind: 'like', ts: 1710000000000 });
  });
  it('refuses paths outside home', async () => {
    const r = await fetch(base + '/api/import', { method: 'POST', body: JSON.stringify({ path: '/etc' }) });
    expect(r.status).toBe(403);
    expect(pathAllowed('/etc/passwd')).toBe(false);
  });
  it('caps and samples huge event lists', () => {
    const events = Array.from({ length: 1000 }, (_, i) => ({ ts: i, source: 'browser' as const, kind: 'visit' as const, file: 'x' }));
    const c = capEvents({ source: 'browser', events, claims: [], files: [], warnings: [] }, 100);
    expect(c.events).toHaveLength(100); expect(c.warnings[0]).toMatch(/sampled/);
  });
});
