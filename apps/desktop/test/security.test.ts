import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { listen, originAllowed, pathAllowed } from '../src/server.ts';

let server: http.Server; let base: string; let tmp: string;

beforeAll(async () => {
  const l = await listen(0); server = l.server; base = `http://127.0.0.1:${l.port}`;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-sec-'));
});
afterAll(async () => { await new Promise((r) => server.close(r)); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('cross-site POST protection', () => {
  it('accepts loopback / absent origins and refuses foreign ones', () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed('http://127.0.0.1:4747')).toBe(true);
    expect(originAllowed('http://localhost:5173')).toBe(true);
    expect(originAllowed('http://[::1]:4747')).toBe(true);
    expect(originAllowed('https://evil.example')).toBe(false);
    expect(originAllowed('null')).toBe(false);
  });
  it('a no-cors POST from another site gets 403 before any file is touched', async () => {
    const r = await fetch(base + '/api/import', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' }, body: JSON.stringify({ path: os.homedir() }) });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toMatch(/origin/);
    const ok = await fetch(base + '/api/import', { method: 'POST', headers: { Origin: base }, body: JSON.stringify({ path: path.join(os.homedir(), 'bb-definitely-not-here.zip') }) });
    expect(ok.status).toBe(404); // got past the origin check, failed on the path as before
  });
});

describe('pathAllowed', () => {
  it('still allows a home dir reached through a symlinked home path', () => {
    const realHome = fs.mkdtempSync(path.join(tmp, 'real-home-'));
    const link = path.join(tmp, 'home-link'); fs.symlinkSync(realHome, link, 'dir');
    const file = path.join(realHome, 'Downloads', 'x.zip'); fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, 'zip');
    // home passed as the symlink; the file realpath resolves under the real dir
    expect(pathAllowed(path.join(link, 'Downloads', 'x.zip'), link)).toBe(true);
    expect(pathAllowed(file, link)).toBe(true);
    // a symlink inside home pointing outside is still refused
    const esc = path.join(realHome, 'etc-link'); fs.symlinkSync('/etc', esc, 'dir');
    expect(pathAllowed(path.join(esc, 'passwd'), link)).toBe(false);
    expect(pathAllowed(path.join(esc, 'passwd'), realHome)).toBe(false);
  });
});
