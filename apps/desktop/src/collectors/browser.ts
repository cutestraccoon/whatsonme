import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Event, ParseResult } from '../core.ts';
import { getSql, rows } from '../sqlite.ts';

export type BrowserId = 'chrome' | 'chromium' | 'edge' | 'brave' | 'firefox' | 'safari';
type Family = 'chromium' | 'firefox' | 'safari';

export interface BrowserHistoryDb { browser: BrowserId; family: Family; path: string; bytes: number; profile?: string }

const WEBKIT_EPOCH_OFFSET_US = 11644473600n * 1000000n; // 1601-01-01 -> 1970-01-01 in microseconds
const SAFARI_EPOCH_OFFSET_S = 978307200;                // 2001-01-01 -> 1970-01-01 in seconds

/** WebKit/Chromium time (microseconds since 1601-01-01) -> unix ms. */
export function webkitToMs(us: number | bigint): number {
  const v = BigInt(Math.trunc(Number(us)));
  return Number((v - WEBKIT_EPOCH_OFFSET_US) / 1000n);
}
/** Firefox visit_date (microseconds since unix epoch) -> unix ms. */
export function firefoxToMs(us: number): number { return Math.trunc(us / 1000); }
/** Safari visit_time (float seconds since 2001-01-01) -> unix ms. */
export function safariToMs(s: number): number { return Math.round((s + SAFARI_EPOCH_OFFSET_S) * 1000); }

const SENSITIVE_URL = /(token=|session|password|passwd|pwd=|secret|api_key|apikey|access_key|auth=|otp=)/i;

/** Drop query string + fragment; return undefined for URLs that look like they carry secrets or aren't http(s). */
export function sanitizeUrl(raw: string): string | undefined {
  if (!raw || !/^https?:\/\//i.test(raw)) return undefined;
  if (SENSITIVE_URL.test(raw)) return undefined;
  const cut = raw.search(/[?#]/);
  return cut === -1 ? raw : raw.slice(0, cut);
}

export function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try { return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')); } catch { return false; }
}

function exists(p: string) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function listDirs(p: string): string[] { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(p, d.name)); } catch { return []; } }

/** Chromium "User Data" dir -> History files of Default + Profile N. */
function chromiumProfiles(userData: string): { path: string; profile: string }[] {
  const out: { path: string; profile: string }[] = [];
  for (const dir of listDirs(userData)) {
    const base = path.basename(dir);
    if (base !== 'Default' && !/^Profile \d+$/.test(base)) continue;
    const h = path.join(dir, 'History');
    if (exists(h)) out.push({ path: h, profile: base });
  }
  return out;
}

/** Candidate browser profile roots for this machine (+ Windows drives when running under WSL). */
export function candidateRoots(home = os.homedir()): { browser: BrowserId; family: Family; root: string; kind: 'chromium-userdata' | 'firefox-profiles' | 'safari-file' }[] {
  const c: ReturnType<typeof candidateRoots> = [];
  const plat = process.platform;
  const winLocal = (base: string) => [
    { browser: 'chrome' as const, family: 'chromium' as const, root: path.join(base, 'Google', 'Chrome', 'User Data'), kind: 'chromium-userdata' as const },
    { browser: 'edge' as const, family: 'chromium' as const, root: path.join(base, 'Microsoft', 'Edge', 'User Data'), kind: 'chromium-userdata' as const },
    { browser: 'brave' as const, family: 'chromium' as const, root: path.join(base, 'BraveSoftware', 'Brave-Browser', 'User Data'), kind: 'chromium-userdata' as const },
    { browser: 'chromium' as const, family: 'chromium' as const, root: path.join(base, 'Chromium', 'User Data'), kind: 'chromium-userdata' as const },
  ];
  const winRoaming = (base: string) => [
    { browser: 'firefox' as const, family: 'firefox' as const, root: path.join(base, 'Mozilla', 'Firefox', 'Profiles'), kind: 'firefox-profiles' as const },
  ];
  if (plat === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    c.push(...winLocal(local), ...winRoaming(roaming));
  } else if (plat === 'darwin') {
    const as = path.join(home, 'Library', 'Application Support');
    c.push(
      { browser: 'chrome', family: 'chromium', root: path.join(as, 'Google', 'Chrome'), kind: 'chromium-userdata' },
      { browser: 'edge', family: 'chromium', root: path.join(as, 'Microsoft Edge'), kind: 'chromium-userdata' },
      { browser: 'brave', family: 'chromium', root: path.join(as, 'BraveSoftware', 'Brave-Browser'), kind: 'chromium-userdata' },
      { browser: 'chromium', family: 'chromium', root: path.join(as, 'Chromium'), kind: 'chromium-userdata' },
      { browser: 'firefox', family: 'firefox', root: path.join(as, 'Firefox', 'Profiles'), kind: 'firefox-profiles' },
      { browser: 'safari', family: 'safari', root: path.join(home, 'Library', 'Safari', 'History.db'), kind: 'safari-file' },
    );
  } else {
    const cfg = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
    c.push(
      { browser: 'chrome', family: 'chromium', root: path.join(cfg, 'google-chrome'), kind: 'chromium-userdata' },
      { browser: 'chromium', family: 'chromium', root: path.join(cfg, 'chromium'), kind: 'chromium-userdata' },
      { browser: 'edge', family: 'chromium', root: path.join(cfg, 'microsoft-edge'), kind: 'chromium-userdata' },
      { browser: 'brave', family: 'chromium', root: path.join(cfg, 'BraveSoftware', 'Brave-Browser'), kind: 'chromium-userdata' },
      { browser: 'firefox', family: 'firefox', root: path.join(home, '.mozilla', 'firefox'), kind: 'firefox-profiles' },
      { browser: 'firefox', family: 'firefox', root: path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), kind: 'firefox-profiles' },
    );
    if (isWsl()) {
      for (const user of listDirs('/mnt/c/Users')) {
        const base = path.basename(user);
        if (['Public', 'Default', 'Default User', 'All Users'].includes(base)) continue;
        c.push(...winLocal(path.join(user, 'AppData', 'Local')), ...winRoaming(path.join(user, 'AppData', 'Roaming')));
      }
    }
  }
  return c;
}

/** Find all history DBs present on disk. Only stats paths; never opens them. */
export function detectBrowserDbs(home = os.homedir()): BrowserHistoryDb[] {
  const out: BrowserHistoryDb[] = [];
  const seen = new Set<string>();
  const add = (d: BrowserHistoryDb) => { if (!seen.has(d.path)) { seen.add(d.path); out.push(d); } };
  for (const r of candidateRoots(home)) {
    if (r.kind === 'chromium-userdata') {
      for (const p of chromiumProfiles(r.root)) add({ browser: r.browser, family: 'chromium', path: p.path, profile: p.profile, bytes: fs.statSync(p.path).size });
    } else if (r.kind === 'firefox-profiles') {
      for (const prof of listDirs(r.root)) {
        const p = path.join(prof, 'places.sqlite');
        if (exists(p)) add({ browser: 'firefox', family: 'firefox', path: p, profile: path.basename(prof), bytes: fs.statSync(p).size });
      }
    } else if (exists(r.root)) {
      add({ browser: 'safari', family: 'safari', path: r.root, bytes: fs.statSync(r.root).size });
    }
  }
  return out;
}

/** Guess the family from a path when the caller only has a file (tests, manual import). */
export function guessFamily(p: string): Family {
  const b = path.basename(p).toLowerCase();
  if (b === 'places.sqlite') return 'firefox';
  if (b === 'history.db') return 'safari';
  return 'chromium';
}

/**
 * Copy the DB (and its WAL, if present) to a temp dir, because browsers hold a lock on the live file.
 * Returns the temp copy path and a cleanup fn.
 */
function snapshot(dbPath: string): { tmp: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-hist-'));
  const tmp = path.join(dir, path.basename(dbPath));
  fs.copyFileSync(dbPath, tmp);
  for (const suffix of ['-wal', '-journal']) { try { if (exists(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, tmp + suffix); } catch { /* ignore */ } }
  return { tmp, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } } };
}

export interface CollectOptions { browser?: BrowserId; family?: Family; maxEvents?: number }

/** Read one history DB and emit normalized browser visit events. */
export async function collectBrowserHistory(dbPath: string, opts: CollectOptions = {}): Promise<ParseResult> {
  const family = opts.family ?? guessFamily(dbPath);
  const browser: BrowserId = opts.browser ?? (family === 'chromium' ? 'chrome' : family);
  const warnings: string[] = [];
  const events: Event[] = [];
  const SQL = await getSql();
  const snap = snapshot(dbPath);
  let skippedSensitive = 0;
  try {
    const db = new SQL.Database(fs.readFileSync(snap.tmp));
    try {
      let recs: { url: string; title: string | null; t: number }[] = [];
      if (family === 'chromium') {
        recs = rows<{ url: string; title: string | null; t: number }>(db,
          'SELECT u.url AS url, u.title AS title, v.visit_time AS t FROM visits v JOIN urls u ON u.id = v.url WHERE v.visit_time > 0')
          .map((r) => ({ ...r, t: webkitToMs(r.t) }));
      } else if (family === 'firefox') {
        recs = rows<{ url: string; title: string | null; t: number }>(db,
          'SELECT p.url AS url, p.title AS title, v.visit_date AS t FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id WHERE v.visit_date > 0')
          .map((r) => ({ ...r, t: firefoxToMs(r.t) }));
      } else {
        recs = rows<{ url: string; title: string | null; t: number }>(db,
          'SELECT i.url AS url, v.title AS title, v.visit_time AS t FROM history_visits v JOIN history_items i ON i.id = v.history_item WHERE v.visit_time > 0')
          .map((r) => ({ ...r, t: safariToMs(r.t) }));
      }
      for (const r of recs) {
        const url = sanitizeUrl(String(r.url ?? ''));
        if (!url) { skippedSensitive++; continue; }
        if (!Number.isFinite(r.t) || r.t <= 0) continue;
        events.push({ ts: r.t, source: 'browser', kind: 'visit', title: r.title ?? undefined, url, file: dbPath, meta: { browser } });
      }
    } finally { db.close(); }
  } catch (e) {
    warnings.push(`${browser}: could not read ${dbPath}: ${(e as Error).message}`);
  } finally { snap.cleanup(); }
  if (skippedSensitive) warnings.push(`${browser}: skipped ${skippedSensitive} URLs that were non-http or looked like they carried tokens/sessions.`);
  events.sort((a, b) => a.ts - b.ts);
  return { source: 'browser', events, claims: [], files: [dbPath], warnings };
}

/** Collect every detected browser DB and merge into one ParseResult. */
export async function collectAllBrowsers(dbs = detectBrowserDbs()): Promise<ParseResult> {
  const out: ParseResult = { source: 'browser', events: [], claims: [], files: [], warnings: [] };
  for (const d of dbs) {
    const r = await collectBrowserHistory(d.path, { browser: d.browser, family: d.family });
    out.events.push(...r.events); out.files.push(...r.files); out.warnings.push(...r.warnings);
  }
  if (!dbs.length) out.warnings.push('No browser history databases found.');
  out.events.sort((a, b) => a.ts - b.ts);
  return out;
}
