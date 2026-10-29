import { describe, expect, it } from 'vitest';
import { MapArchive, MultiArchive, ZipArchive } from '../src/util/archive.js';
import { zipSync } from 'fflate';
import { apple } from '../src/parsers/apple.js';
import { tiktok } from '../src/parsers/tiktok.js';
import { google } from '../src/parsers/google.js';
import { weeklyMood } from '../src/insights/eras.js';
import { buildDossier, buildRoutine } from '../src/insights/dossier.js';
import type { Event } from '../src/types.js';

const enc = new TextEncoder();
const archive = (files: Record<string, string>) => new MapArchive(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc.encode(v)])));

describe('apple health export.xml', () => {
  const rec = (type: string, start: string, value: string, extra = '') =>
    `<Record type="${type}" sourceName="Apple Watch" sourceVersion="10.0" device="&lt;&lt;HKDevice: 0x1, name:Apple Watch, model:Watch, hardware:Watch6,1>>" unit="count" creationDate="${start}" startDate="${start}" endDate="${start}" value="${value}"${extra}/>`;
  it('survives ">" inside the device attribute and buckets steps by the local day', async () => {
    const xml = `<?xml version="1.0"?><HealthData locale="en_CA">\n` +
      rec('HKQuantityTypeIdentifierStepCount', '2024-03-17 21:30:00 -0400', '500') + '\n' +
      rec('HKQuantityTypeIdentifierStepCount', '2024-03-17 23:30:00 -0400', '700') + '\n' + // 03:30 UTC next day
      rec('HKQuantityTypeIdentifierHeartRate', '2024-03-17 23:31:00 -0400', '72') + '\n' +
      `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="x" device="&lt;&lt;HKDevice: 0x2>>" startDate="2024-03-18 07:00:00 -0400" endDate="2024-03-18 07:30:00 -0400">\n<MetadataEntry key="a" value="b"/>\n</Workout>\n</HealthData>`;
    const res = await apple.parse(archive({ 'apple_health_export/export.xml': xml }));
    const steps = res.events.filter((e) => e.title === 'StepCount');
    expect(steps).toHaveLength(1);                       // one local day, not split across the UTC midnight
    expect(steps[0].value).toBe(1200);
    expect(new Date(steps[0].ts).toISOString().slice(0, 10)).toBe('2024-03-17');
    expect(res.claims.find((c) => c.field === 'health_records')?.value).toBe('3');
    const wk = res.events.find((e) => e.title === 'workout');
    expect(wk?.actor).toBe('Running'); expect(wk?.value).toBe(30 * 60000);
    expect(wk?.ts).toBe(Date.UTC(2024, 2, 18, 11, 0, 0));
  });
  it('parses records that straddle decode chunks identically to the one-shot path', async () => {
    const recs: string[] = [];
    for (let i = 0; i < 4000; i++) recs.push(rec('HKQuantityTypeIdentifierStepCount', `2024-01-${String(1 + (i % 28)).padStart(2, '0')} 10:00:00 -0500`, String(10)));
    const small = await apple.parse(archive({ 'export.xml': `<HealthData>\n${recs.join('\n')}\n</HealthData>` }));
    // Same records, padded past the 16 MB one-shot limit so the chunked decoder runs (records interleaved with padding).
    const pad = '<!-- ' + 'x'.repeat(4000) + ' -->';
    const bigXml = `<HealthData>\n${recs.map((r) => r + '\n' + pad).join('\n')}\n</HealthData>`;
    expect(bigXml.length).toBeGreaterThan(16 * 1024 * 1024);
    const big = await apple.parse(archive({ 'export.xml': bigXml }));
    expect(big.claims.find((c) => c.field === 'health_records')?.value).toBe('4000');
    expect(big.claims.find((c) => c.field === 'health_records')?.value).toBe(small.claims.find((c) => c.field === 'health_records')?.value);
    expect(big.events.filter((e) => e.title === 'StepCount').map((e) => e.value)).toEqual(small.events.filter((e) => e.title === 'StepCount').map((e) => e.value));
  });
});

describe('tiktok favourites vs watch history', () => {
  it('FavoriteVideoList is a save, not a watch', async () => {
    const j = { Activity: {
      'Video Browsing History': { VideoList: [{ Date: '2024-03-17 23:48:10', Link: 'https://t/1' }] },
      'Favorite Videos': { FavoriteVideoList: [{ Date: '2024-03-18 01:00:00', Link: 'https://t/2' }] },
      'Like List': { ItemFavoriteList: [{ Date: '2024-03-18 02:00:00', Link: 'https://t/3' }] },
    } };
    const res = await tiktok.parse(archive({ 'user_data_tiktok.json': JSON.stringify(j) }));
    expect(res.events.map((e) => e.kind).sort()).toEqual(['like', 'save', 'watch']);
    expect(res.events.find((e) => e.kind === 'watch')?.ts).toBe(Date.UTC(2024, 2, 17, 23, 48, 10));
  });
});

describe('google Timeline.json (on-device export)', () => {
  it('reads Android timelinePath offsets and iOS absolute times, and labels Home case-insensitively', async () => {
    const j = { semanticSegments: [
      { startTime: '2024-06-03T14:00:00.000-04:00', endTime: '2024-06-03T15:00:00.000-04:00', timelinePath: [
        { point: '43.70°, -79.40°', durationMinutesOffsetFromStartTime: '10' },
        { point: '43.71°, -79.41°', time: '2024-06-03T14:30:00.000-04:00' },
      ] },
      { startTime: '2024-06-03T20:00:00.000-04:00', endTime: '2024-06-04T07:00:00.000-04:00', visit: { probability: 0.9, topCandidate: { placeId: 'x', semanticType: 'Inferred_Home', probability: '0.85', placeLocation: { latLng: '43.6532°, -79.3832°' } } } },
    ] };
    const res = await google.parse(archive({ 'timeline.json': JSON.stringify(j) }));
    const path = res.events.filter((e) => e.title === 'path');
    expect(path.map((e) => e.ts)).toEqual([Date.UTC(2024, 5, 3, 18, 10), Date.UTC(2024, 5, 3, 18, 30)]);
    const home = res.claims.find((c) => c.field === 'inferred_home');
    expect(home?.value).toBe('43.653, -79.383'); expect(home?.confidence).toBeCloseTo(0.85);
  });
  it('Profile.json birthday as an object does not become "[obj-••-••"', async () => {
    const res = await google.parse(archive({ 'takeout/profile/profile.json': JSON.stringify({ birthday: { year: 1990, month: 5, day: 1 } }) }));
    expect(res.claims.find((c) => c.field === 'declared_birthday')?.value).toBe('1990-••-••');
  });
});

describe('archives', () => {
  it('ZipArchive does not inflate media; MultiArchive dedupes and resolves in O(1)', async () => {
    const zip = zipSync({ 'a/liked_posts.json': enc.encode('{}'), 'media/photo.jpg': new Uint8Array(1024 * 64).fill(1) });
    const z = new ZipArchive(zip);
    expect(z.list()).toEqual(['a/liked_posts.json']);
    const m = new MultiArchive([z, archive({ 'A/Liked_Posts.json': '{"x":1}', 'b.txt': 'hi' })]);
    expect(m.list()).toEqual(['a/liked_posts.json', 'b.txt']);
    expect(await m.text('A/Liked_Posts.json')).toBe('{}'); // first archive wins, as before
    expect(m.size('b.txt')).toBe(2);
  });
});

describe('insights on large / empty inputs', () => {
  it('weeklyMood does not overflow the stack on 300k events', () => {
    const base = Date.UTC(2024, 0, 1); const events: Event[] = [];
    for (let i = 0; i < 300_000; i++) events.push({ ts: base + i * 1000, source: 'youtube', kind: 'watch', title: 'condo tour ' + i, file: 'f' });
    expect(() => weeklyMood(events, 'UTC')).not.toThrow();
    expect(weeklyMood(events, 'UTC')).toHaveLength(12);
  });
  it('does not assert "Not a parent" from no data, nor invent Home/Work from a single ping', () => {
    expect(buildDossier([], [], 'UTC').find((r) => r.field === 'PARENTAL STATUS')).toBeUndefined();
    const ping: Event = { ts: Date.UTC(2024, 2, 17, 17, 0), source: 'snapchat', kind: 'location', lat: 43.65, lon: -79.38, file: 'json/location_history.json' };
    const r = buildRoutine([ping], [], 'America/Toronto');
    expect(r.home).toBeUndefined(); expect(r.work).toBeUndefined();
    expect(r.facts[0].v).toBe('—');
    // but a real overnight cluster still becomes Home
    const nights: Event[] = Array.from({ length: 20 }, (_, i) => ({ ts: Date.UTC(2024, 2, 1 + i, 5, 0), source: 'google', kind: 'location', lat: 43.65, lon: -79.38, value: 8 * 3600000, file: 'timeline.json' }));
    expect(buildRoutine(nights, [], 'America/Toronto').home).toBeDefined();
  });
});

describe('localParts cache', () => {
  it('matches Intl exactly across DST transitions and odd offsets', async () => {
    const { localParts } = await import('../src/insights/attention.js');
    for (const tz of ['America/Toronto', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Chatham', 'UTC']) {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric' });
      for (let ts = Date.UTC(2024, 2, 9, 0, 0); ts < Date.UTC(2024, 2, 11, 12, 0); ts += 7 * 60000 + 13000) {
        const p = f.formatToParts(new Date(ts)); const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
        const lp = localParts(ts, tz);
        expect([lp.hour, lp.y, lp.m, lp.d], `${tz} ${new Date(ts).toISOString()}`).toEqual([g('hour') % 24, g('year'), g('month'), g('day')]);
      }
    }
  });
});
