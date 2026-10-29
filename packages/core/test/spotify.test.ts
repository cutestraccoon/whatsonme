import { describe, expect, it } from 'vitest';
import { spotify } from '../src/parsers/spotify.js';
import { makeSpotifyArchive } from './fixtures/spotify.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('spotify parser', () => {
  it('parses account + extended streaming history, profile and inferences', async () => {
    const res = await checkParser(spotify, makeSpotifyArchive(), { kinds: ['play'], minEvents: 250, claimFields: ['declared_country', 'declared_birth_year', 'declared_gender', 'ad_interest', 'declared_username'] });
    expect(res.events.filter((e) => e.kind === 'play').length).toBe(280);
    expect(res.events.some((e) => e.meta?.skipped === true)).toBe(true);
    expect(res.events.every((e) => typeof e.value === 'number' && e.value >= 0)).toBe(true);
    expect(res.events.every((e) => e.title && e.actor)).toBe(true);
    expect(res.claims.find((c) => c.field === 'declared_birth_year')?.value).toBe('1996');
    expect(res.claims.filter((c) => c.field === 'ad_interest').length).toBe(12);
    expect(res.claims.find((c) => c.field === 'declared_email')?.value).not.toContain('ferris@');
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
