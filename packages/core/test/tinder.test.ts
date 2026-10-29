import { describe, expect, it } from 'vitest';
import { tinder } from '../src/parsers/dating.js';
import { makeTinderArchive } from './fixtures/tinder.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('tinder parser', () => {
  it('parses daily usage counters, sent messages and declared profile', async () => {
    const res = await checkParser(tinder, makeTinderArchive(), { kinds: ['swipe', 'match', 'message', 'session', 'purchase'], minEvents: 300,
      claimFields: ['declared_birth_year', 'declared_gender', 'interested_in', 'declared_city', 'conversations_count', 'age_filter'] });
    expect(res.events.filter((e) => e.kind === 'swipe' && e.meta?.daily).every((e) => typeof e.value === 'number' && e.value! > 0)).toBe(true);
    expect(res.events.some((e) => e.kind === 'swipe' && e.meta?.direction === 'like')).toBe(true);
    expect(res.events.some((e) => e.kind === 'swipe' && e.meta?.direction === 'pass')).toBe(true);
    expect(res.events.filter((e) => e.kind === 'message' && !e.meta?.daily).length).toBeGreaterThan(30);
    expect(res.claims.find((c) => c.field === 'declared_birth_year')?.value).toBe('1996');
    expect(res.claims.find((c) => c.field === 'declared_gender')?.value).toBe('male');
    expect(res.claims.find((c) => c.field === 'declared_city')?.value).toBe('Toronto');
    expect(res.claims.find((c) => c.field === 'conversations_count')?.value).toBe('18');
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
