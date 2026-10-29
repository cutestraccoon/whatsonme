/** Meta exports encode UTF-8 as latin1 escapes ("ð\u009f\u0098\u0080"). Repair it. */
export function fixMojibake(s: string): string {
  if (!s || !/[\u0080-ÿ]/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xff) return s; // genuine unicode, not mojibake
      bytes[i] = c;
    }
    const out = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return out;
  } catch { return s; }
}

export function safeJson<T = any>(txt: string): T | null {
  try { return JSON.parse(txt) as T; } catch { return null; }
}

/** "2024-03-17 23:48:10" (UTC) or ISO or unix seconds/ms -> ms */
export function toMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e11 ? v * 1000 : v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{9,13}$/.test(s)) return toMs(Number(s));
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const [, Y, M, D, h, mi, se, frac, tz] = m;
    let t = Date.UTC(+Y, +M - 1, +D, +h, +mi, +(se ?? 0), frac ? Math.round(Number('0.' + frac) * 1000) : 0);
    if (tz && tz !== 'Z') { const sign = tz[0] === '-' ? -1 : 1; const hh = +tz.slice(1, 3); const mm = +tz.slice(-2); t -= sign * (hh * 60 + mm) * 60000; }
    return t;
  }
  const d = Date.parse(s);
  return Number.isNaN(d) ? null : d;
}

/** Minimal CSV parser (handles quotes, commas, newlines in quotes). */
export function parseCsv(txt: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift()?.map((h) => h.replace(/^﻿/, '').trim()) ?? [];
  return rows.filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function basename(p: string): string { return p.slice(p.lastIndexOf('/') + 1); }
export function byName(paths: string[], re: RegExp): string[] { return paths.filter((p) => re.test(p)); }
