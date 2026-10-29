import { describe, it, expect } from 'vitest';
import { instagram, tiktok, google, apple, parseAll, detectSources } from '../src/parsers/index.js';
import { buildReport } from '../src/insights/index.js';
import { MultiArchive } from '../src/util/archive.js';
import { fixMojibake, toMs, parseCsv } from '../src/util/text.js';
import { makeInstagramArchive, makeTikTokArchive, makeGoogleArchive, makeAppleArchive } from './fixtures/core.js';

const inRange = (ts: number) => ts > Date.UTC(2020, 0, 1) && ts < Date.UTC(2027, 0, 1);

describe('util', () => {
  it('repairs Meta mojibake', () => { expect(fixMojibake('â\u009d¤ï¸\u008f')).toBe('❤️'); expect(fixMojibake('plain')).toBe('plain'); });
  it('parses the timestamp shapes we meet', () => {
    expect(toMs(1710000000)).toBe(1710000000000); expect(toMs('2024-03-17 23:48:10')).toBe(Date.UTC(2024, 2, 17, 23, 48, 10));
    expect(toMs('2024-03-17T23:48:10.123Z')).toBe(Date.UTC(2024, 2, 17, 23, 48, 10, 123)); expect(toMs('2024-03-17 23:48:10 -0400')).toBe(Date.UTC(2024, 2, 18, 3, 48, 10)); });
  it('parses quoted csv', () => { const r = parseCsv('a,b\n"x, y",2\n'); expect(r[0]).toEqual({ a: 'x, y', b: '2' }); });
});

describe('instagram', () => {
  it('detects and parses', async () => { const a = makeInstagramArchive(); expect(instagram.detect(a.list())).toBe(true); expect(instagram.detect(['foo/bar.json'])).toBe(false);
    const r = await instagram.parse(a); const kinds = count(r.events.map((e) => e.kind));
    expect(kinds.watch).toBeGreaterThan(500); expect(kinds.like).toBeGreaterThan(50); expect(kinds.search).toBe(10); expect(kinds.off_platform).toBe(150); expect(kinds.login).toBe(30); expect(kinds.ad_view).toBeGreaterThan(20);
    expect(r.claims.filter((c) => c.field === 'topic').length).toBe(6); expect(r.claims.filter((c) => c.field === 'advertiser_audience').length).toBe(31); expect(r.claims.find((c) => c.field === 'profile_based_in')?.value).toBe('Toronto, Ontario');
    expect(r.claims.find((c) => c.field === 'declared_email')?.value).not.toContain('alex@example'); expect(r.events.every((e) => e.file && inRange(e.ts))).toBe(true); expect(r.events.find((e) => e.kind === 'like')?.url).toContain('instagram.com'); });
});
describe('tiktok', () => {
  it('parses the 2024+ shape', async () => { const a = makeTikTokArchive(); expect(tiktok.detect(a.list())).toBe(true); const r = await tiktok.parse(a); const k = count(r.events.map((e) => e.kind));
    expect(k.watch).toBeGreaterThan(1000); expect(k.like).toBeGreaterThan(20); expect(k.search).toBe(20); expect(k.login).toBe(25); expect(k.off_platform).toBe(20); expect(k.message).toBe(40);
    expect(r.claims.filter((c) => c.field === 'ad_interest').length).toBe(5); expect(r.claims.find((c) => c.field === 'carrier')?.value).toBe('Rogers'); expect(r.events.every((e) => e.file && inRange(e.ts))).toBe(true); });
});
describe('google', () => {
  it('parses activity, youtube, semantic location, access log, chrome, play', async () => { const a = makeGoogleArchive(); expect(google.detect(a.list())).toBe(true); const r = await google.parse(a); const k = count(r.events.map((e) => e.kind));
    expect(k.search).toBe(400); expect(k.watch).toBe(900); expect(k.ad_view).toBe(60); expect(k.location).toBeGreaterThan(200); expect(k.trip).toBeGreaterThan(100); expect(k.login).toBe(50); expect(k.visit).toBe(300); expect(k.install).toBe(30);
    expect(r.events.filter((e) => e.source === 'youtube').length).toBe(900); expect(r.claims.some((c) => c.field === 'inferred_home')).toBe(true); expect(r.claims.some((c) => c.field === 'inferred_work')).toBe(true); expect(r.events.find((e) => e.kind === 'trip')?.meta?.prob).toBe(91.2); });
});
describe('apple', () => {
  it('parses music, app store, health', async () => { const a = makeAppleArchive(); expect(apple.detect(a.list())).toBe(true); const r = await apple.parse(a); const k = count(r.events.map((e) => e.kind));
    expect(k.play).toBe(500); expect(k.search).toBe(40); expect(k.health).toBeGreaterThan(200); expect(r.events.filter((e) => e.title === 'sleep').length).toBe(120); expect(r.events.filter((e) => e.title === 'StepCount').length).toBe(120); expect(r.events.filter((e) => e.title === 'workout').length).toBe(40); });
});
describe('end to end', () => {
  it('detects all four and builds a report with insights', async () => {
    const multi = new MultiArchive([makeInstagramArchive(), makeTikTokArchive(), makeGoogleArchive(), makeAppleArchive()]);
    expect(detectSources(multi).map((p) => p.source).sort()).toEqual(['apple', 'google', 'instagram', 'tiktok']);
    const results = await parseAll(multi); const rep = buildReport(results, 'America/Toronto');
    expect(rep.totals.events).toBeGreaterThan(5000); expect(rep.score.value).toBeGreaterThan(30); expect(rep.score.value).toBeLessThanOrEqual(100);
    expect(rep.dossier.find((d) => d.field === 'HOME')).toBeTruthy(); expect(rep.dossier.find((d) => d.field === 'HOUSING')).toBeTruthy(); expect(rep.dossier.find((d) => d.field === 'DEVICE')?.value).toContain('Rogers');
    expect(rep.routine.transport?.mode).toBe('IN_PASSENGER_VEHICLE'); expect(rep.routine.home).toBeTruthy(); expect(rep.routine.work).toBeTruthy(); expect(rep.routine.secondBase).toBeTruthy();
    expect(rep.attention.grid.length).toBe(7); expect(rep.attention.peak.hours.length).toBe(3); expect(rep.attention.totals.consumed).toBeGreaterThan(1000);
    expect(rep.feeds.length).toBeGreaterThanOrEqual(3); expect(rep.weeks.length).toBe(12); expect(rep.eras.length).toBeGreaterThan(0);
    expect(rep.snitches.filter((s) => s.kind !== 'pixel').length).toBeGreaterThanOrEqual(3); expect(rep.snitches.find((s) => s.name === 'Rogers')?.kind).toBe('uploaded');
    expect(rep.summary.length).toBeGreaterThan(40); expect(rep.verdict).toContain('“'); expect(rep.dump.length).toBeGreaterThan(4); expect(rep.flags.length).toBeGreaterThan(2);
    expect(rep.dossier.every((d) => d.file !== undefined && d.why && d.used)).toBe(true);
  });
});
function count<T extends string>(arr: T[]) { const o: Record<string, number> = {}; for (const a of arr) o[a] = (o[a] ?? 0) + 1; return o; }
