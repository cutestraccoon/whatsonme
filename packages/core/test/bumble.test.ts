import { describe, expect, it } from 'vitest';
import { bumble } from '../src/parsers/dating.js';
import { makeBumbleArchive } from './fixtures/bumble.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('bumble parser (best effort)', () => {
  it('classifies votes, matches and messages by key names', async () => {
    const res = await checkParser(bumble, makeBumbleArchive(), { kinds: ['swipe', 'match', 'message'], minEvents: 200, claimFields: ['declared_birth_year', 'declared_gender', 'interested_in', 'declared_city'] });
    expect(res.events.filter((e) => e.kind === 'swipe').length).toBe(120);
    expect(res.events.filter((e) => e.kind === 'match').length).toBe(25);
    expect(res.events.filter((e) => e.kind === 'message').length).toBe(80);
    expect(res.events.filter((e) => e.kind === 'message').every((e) => typeof e.value === 'number' && e.value! > 0 && e.actor)).toBe(true);
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
