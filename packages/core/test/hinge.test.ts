import { describe, expect, it } from 'vitest';
import { hinge } from '../src/parsers/dating.js';
import { makeHingeArchive } from './fixtures/hinge.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('hinge parser', () => {
  it('parses likes, matches, chats, unmatches and the declared profile', async () => {
    const res = await checkParser(hinge, makeHingeArchive(), { kinds: ['swipe', 'match', 'message', 'other'], minEvents: 100,
      claimFields: ['matches_count', 'likes_sent_count', 'declared_birth_year', 'declared_gender', 'age_filter', 'declared_phone'] });
    expect(res.files).toContain('hinge data export/matches.json');
    expect(res.files).toContain('hinge data export/user.json');
    expect(Number(res.claims.find((c) => c.field === 'matches_count')?.value)).toBe(res.events.filter((e) => e.kind === 'match').length);
    expect(res.events.filter((e) => e.kind === 'message').every((e) => typeof e.value === 'number')).toBe(true);
    expect(res.claims.find((c) => c.field === 'declared_birth_year')?.value).toBe('1996');
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
