import { expect } from 'vitest';
import type { Claim, Event, Kind, Parser, ParseResult, Source } from '../src/types.js';
import type { MapArchive } from '../src/util/archive.js';
import { UNRELATED_PATHS } from './fixtures/_rng.js';

export const T2023 = Date.UTC(2023, 0, 1);
export const T2027 = Date.UTC(2027, 0, 1);

/** The invariants every parser must satisfy on its fixture. */
export async function checkParser(parser: Parser, fx: MapArchive, opts: { source?: Source; kinds: Kind[]; minEvents?: number; claimFields?: string[] } ): Promise<ParseResult> {
  expect(parser.detect(fx.list())).toBe(true);
  expect(parser.detect(UNRELATED_PATHS)).toBe(false);
  const res = await parser.parse(fx);
  expect(res.source).toBe(opts.source ?? parser.source);
  expect(res.events.length).toBeGreaterThanOrEqual(opts.minEvents ?? 1);
  for (const k of opts.kinds) expect(res.events.filter((e) => e.kind === k).length, `kind ${k}`).toBeGreaterThan(0);
  checkEvents(res.events, opts.source ?? parser.source);
  checkClaims(res.claims, opts.source ?? parser.source);
  for (const f of opts.claimFields ?? []) expect(res.claims.some((c) => c.field === f), `claim ${f}`).toBe(true);
  expect(res.files.length).toBeGreaterThan(0);
  for (const f of res.files) expect(fx.list()).toContain(f);
  return res;
}

export function checkEvents(events: Event[], source: Source) {
  for (const e of events) {
    expect(typeof e.ts).toBe('number');
    expect(e.ts).toBeGreaterThan(T2023);
    expect(e.ts).toBeLessThan(T2027);
    expect(e.source).toBe(source);
    expect(typeof e.file).toBe('string');
    expect(e.file.length).toBeGreaterThan(0);
  }
}
export function checkClaims(claims: Claim[], source: Source) {
  for (const c of claims) {
    expect(c.source).toBe(source);
    expect(typeof c.field).toBe('string');
    expect(typeof c.value).toBe('string');
    expect(typeof c.file).toBe('string');
    expect(c.file.length).toBeGreaterThan(0);
  }
}
/** Nothing that looks like a full email / phone / IPv4 leaked into a string field. */
export function expectMasked(res: ParseResult) {
  const strings: string[] = [];
  for (const c of res.claims) { if (!/_id$/.test(c.field)) strings.push(c.value); for (const v of Object.values(c.meta ?? {})) if (typeof v === 'string') strings.push(v); }
  for (const e of res.events) { for (const v of Object.values(e.meta ?? {})) if (typeof v === 'string') strings.push(v); }
  for (const s of strings) {
    expect(s, 'raw email').not.toMatch(/^[a-z0-9._-]{4,}@[a-z0-9.-]+\.[a-z]{2,}$/i);
    expect(s, 'raw ipv4').not.toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    expect(s, 'raw phone').not.toMatch(/^\+?\d[\d ]{9,}$/);
  }
}
