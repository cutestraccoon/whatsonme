import { describe, expect, it } from 'vitest';
import { google } from '../../src/parsers/google.js';
import { parseAll } from '../../src/parsers/index.js';
import { by, real } from './_load.js';

describe('real: google takeout (Feb 2026, ccs-amsterdam)', () => {
  it('parses YouTube history (deduped across watch/search files), Chrome/History.json, Maps places + reviews, device info', async () => {
    const a = real('google-takeout-2026.zip');
    const all = await parseAll(a);
    expect(all.map((r) => r.source)).toEqual(['google']);
    const r = all[0];
    expect(by(r.events, 'watch')).toBe(3);   // 3 in watch-history (one is an ad that ALSO appears in search-history)
    expect(by(r.events, 'search')).toBe(4);
    expect(r.events.filter((e) => e.source === 'youtube' && e.meta?.ad).length).toBe(1);
    expect(r.events.filter((e) => e.source === 'browser').length).toBe(34);   // Chrome/History.json "Browser History"
    expect(by(r.events, 'post')).toBe(2);    // Maps (your places)/Reviews.json
    expect(r.claims.find((c) => c.field === 'labeled_place')?.value).toBe('Home');
    expect(r.claims.find((c) => c.field === 'device')?.value).toMatch(/Chrome LINUX/);
    expect(r.claims.find((c) => c.field === 'subscriptions_count')?.value).toBe('2');
    expect(r.warnings).toEqual([]);
  });
});

describe('real: google My Activity HTML (purarue/google_takeout_parser fixture)', () => {
  it('parses outer-cell blocks with action, url, timestamp and location', async () => {
    const a = real('google-html');
    expect(google.detect(a.list())).toBe(true);
    const r = await google.parse(a);
    expect(r.events.length).toBe(3);
    expect(by(r.events, 'visit')).toBe(2);
    const s = r.events.find((e) => e.kind === 'search')!;
    expect(s.title).toBe('adobe creative cloud');
    expect(new Date(s.ts).toISOString()).toBe('2017-02-08T00:32:36.000Z');
    expect(s.lat).toBeCloseTo(25.8008, 3);
    expect(String(s.meta?.location)).toContain('From your home');
    expect(r.events[0].ts).toBe(Date.UTC(2018, 0, 31, 22, 54, 50));
    expect(r.warnings.some((w) => /HTML/.test(w))).toBe(true);
  });
});

describe('real-shaped: google timeline (kurupted/google-maps-timeline-viewer samples)', () => {
  it('iOS Timeline.json is a bare array with geo: strings', async () => {
    const r = await google.parse(real('google-timeline-ios'));
    expect(by(r.events, 'trip')).toBe(3);
    const visits = r.events.filter((e) => e.kind === 'location' && e.title !== 'path');
    expect(visits.length).toBe(3);
    expect(visits[0].title).toBe('Times Square');
    expect(visits[0].lat).toBeCloseTo(40.7589, 3);
    expect(r.events.filter((e) => e.title === 'path').length).toBe(15);
  });
  it('Semantic Location History month file', async () => {
    const a = real('google-semantic');
    expect(google.detect(a.list())).toBe(true);
    const r = await google.parse(a);
    expect(by(r.events, 'location')).toBe(3);
    expect(by(r.events, 'trip')).toBe(3);
    expect(r.events.find((e) => e.kind === 'trip')?.value).toBe(550);
  });
});

describe('real: youtube watch-history.json (2025, yutotakano)', () => {
  it('keeps "Watched" rows as watch and "Viewed" community posts as other', async () => {
    const r = await google.parse(real('youtube'));
    expect(r.events.length).toBe(6);
    expect(by(r.events, 'watch')).toBe(4);
    expect(r.events.every((e) => e.source === 'youtube')).toBe(true);
    expect(r.events[0].url).toBe('https://www.youtube.com/watch?v=Y6VSGTC1n1g');
  });
});
