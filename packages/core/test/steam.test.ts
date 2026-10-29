import { describe, expect, it } from 'vitest';
import { steam } from '../src/parsers/gaming.js';
import { makeSteamArchive } from './fixtures/steam.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('steam parser', () => {
  it('parses playtime, logins and account info', async () => {
    const res = await checkParser(steam, makeSteamArchive(), { kinds: ['play', 'login', 'other'], minEvents: 60, claimFields: ['games_count', 'total_playtime_hours', 'declared_username', 'declared_email', 'declared_country'] });
    expect(res.events.filter((e) => e.kind === 'play').length).toBe(40);
    expect(res.events.filter((e) => e.kind === 'play').every((e) => e.title && typeof e.value === 'number' && e.meta?.appid)).toBe(true);
    expect(res.events.filter((e) => e.kind === 'login').every((e) => String(e.meta?.ip).includes('•'))).toBe(true);
    expect(res.claims.find((c) => c.field === 'games_count')?.value).toBe('40');
    expect(res.files.some((f) => /achievements/.test(f))).toBe(false);
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
