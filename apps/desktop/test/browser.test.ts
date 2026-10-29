import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSql } from '../src/sqlite.ts';
import { collectBrowserHistory, webkitToMs, sanitizeUrl, safariToMs } from '../src/collectors/browser.ts';

const toWebkit = (unixMs: number) => BigInt(unixMs) * 1000n + 11644473600n * 1000000n;

let dir: string;
let dbPath: string;
// 2024-03-09T16:00:00Z, 2024-03-10T16:00:00Z, 2024-03-11T16:00:00Z
const TS = [1710000000000, 1710086400000, 1710172800000];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-test-'));
  dbPath = path.join(dir, 'History');
  const SQL = await getSql();
  const db = new SQL.Database();
  db.run(`CREATE TABLE urls(id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER, typed_count INTEGER, last_visit_time INTEGER, hidden INTEGER);
          CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, from_visit INTEGER, transition INTEGER);`);
  db.run(`INSERT INTO urls VALUES (1,'https://example.com/a?utm=1#frag','Example A',1,0,0,0),
                                 (2,'https://news.site/story','Story',1,0,0,0),
                                 (3,'https://shop.test/cart','Cart',1,0,0,0),
                                 (4,'https://bank.test/login?token=abc','Secret',1,0,0,0)`);
  db.run(`INSERT INTO visits VALUES (1,1,${toWebkit(TS[0])},0,0),(2,2,${toWebkit(TS[1])},0,0),(3,3,${toWebkit(TS[2])},0,0),(4,4,${toWebkit(TS[2] + 1000)},0,0)`);
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('browser collector', () => {
  it('converts WebKit microseconds to unix ms', () => {
    expect(webkitToMs(toWebkit(TS[0]))).toBe(TS[0]);
    expect(webkitToMs(11644473600n * 1000000n)).toBe(0);
  });
  it('converts Safari seconds-since-2001 to unix ms', () => {
    expect(safariToMs(0)).toBe(978307200000);
  });
  it('strips query strings and drops sensitive urls', () => {
    expect(sanitizeUrl('https://x.test/p?q=1#h')).toBe('https://x.test/p');
    expect(sanitizeUrl('https://x.test/reset?password=1')).toBeUndefined();
    expect(sanitizeUrl('chrome://settings')).toBeUndefined();
  });
  it('reads a Chromium History db and emits visit events', async () => {
    const r = await collectBrowserHistory(dbPath, { browser: 'chrome', family: 'chromium' });
    expect(r.source).toBe('browser');
    expect(r.events).toHaveLength(3); // 4th row has token= and is skipped
    expect(r.events.map((e) => e.ts)).toEqual(TS);
    expect(r.events.every((e) => e.kind === 'visit' && e.meta?.browser === 'chrome' && e.file === dbPath)).toBe(true);
    expect(r.events[0].url).toBe('https://example.com/a');
    expect(r.events[0].title).toBe('Example A');
    expect(r.warnings.some((w) => /skipped 1/.test(w))).toBe(true);
    // the original db must be untouched (we worked on a temp copy)
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
