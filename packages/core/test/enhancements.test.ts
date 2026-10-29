import { describe, it, expect } from 'vitest';
import { parseAll } from '../src/parsers/index.js';
import { buildReport, buildLetter } from '../src/insights/index.js';
import { MultiArchive, MapArchive } from '../src/util/archive.js';
import { makeInstagramArchive, makeTikTokArchive, makeGoogleArchive, makeAppleArchive } from './fixtures/core.js';

describe('finds + letters + empty report', () => {
  it('produces safe creepiest finds', async () => {
    const rep = buildReport(await parseAll(new MultiArchive([makeInstagramArchive(), makeTikTokArchive(), makeGoogleArchive(), makeAppleArchive()])), 'America/Toronto');
    expect(rep.finds.length).toBeGreaterThanOrEqual(3);
    for (const f of rep.finds) { expect(f.text).not.toMatch(/\d{2}\.\d{3,}/); expect(f.text).not.toMatch(/@/); }
    expect(rep.finds.some((f) => /labelled your home/.test(f.text))).toBe(true);
    expect(rep.actions.every((a) => a.links)).toBe(true);
    expect(rep.summary).not.toMatch(/\d{2}\.\d{3}/); // no coordinates in summary
  });
  it('builds letters with citations and deadline', () => {
    const l = buildLetter({ company: 'Rogers', kind: 'both', law: 'PIPEDA', yourName: 'A. Person', yourEmail: 'a@b.c' });
    expect(l.subject).toContain('Rogers'); expect(l.body).toContain('Principle 4.9'); expect(l.body).toContain('30 days'); expect(l.body).toContain('A. Person'); expect(l.body).toContain('DELETION');
    const g = buildLetter({ company: 'X', kind: 'access', law: 'GDPR' }); expect(g.body).toContain('Article 15'); expect(g.body).not.toContain('DELETION');
  });
  it('does not crash on an empty archive', async () => {
    const rep = buildReport(await parseAll(new MapArchive({ 'nothing/here.txt': new TextEncoder().encode('x') })), 'UTC');
    expect(rep.totals.events).toBe(0); expect(rep.score.value).toBeGreaterThanOrEqual(0); expect(Number.isNaN(rep.score.value)).toBe(false);
    expect(rep.attention.grid.length).toBe(7); expect(rep.finds).toEqual([]); expect(typeof rep.summary).toBe('string');
    expect(JSON.stringify(rep)).not.toContain('NaN');
  });
});
