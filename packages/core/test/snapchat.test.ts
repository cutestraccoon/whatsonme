import { describe, expect, it } from 'vitest';
import { snapchat } from '../src/parsers/snapchat.js';
import { makeSnapchatArchive } from './fixtures/snapchat.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('snapchat parser', () => {
  it('parses locations, logins, chats, stories and interests', async () => {
    const res = await checkParser(snapchat, makeSnapchatArchive(), { kinds: ['location', 'login', 'message', 'watch', 'post'], minEvents: 200,
      claimFields: ['ad_interest', 'friends_count', 'declared_username', 'declared_birth_year', 'declared_email'] });
    expect(res.events.filter((e) => e.kind === 'location').length).toBe(90);
    expect(res.events.filter((e) => e.kind === 'location').every((e) => typeof e.lat === 'number' && typeof e.lon === 'number' && e.lat! > 43 && e.lon! < -79)).toBe(true);
    expect(res.events.filter((e) => e.kind === 'login').length).toBe(25);
    expect(res.events.filter((e) => e.kind === 'message').length).toBe(80);
    expect(res.events.filter((e) => e.kind === 'message').every((e) => e.actor && typeof e.value === 'number')).toBe(true);
    expect(res.claims.find((c) => c.field === 'friends_count')?.value).toBe('63');
    expect(res.claims.filter((c) => c.field === 'ad_interest').length).toBe(12);
    expect(res.claims.find((c) => c.field === 'declared_birth_year')?.value).toBe('1996');
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
