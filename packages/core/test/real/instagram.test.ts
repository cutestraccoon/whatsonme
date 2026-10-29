import { describe, expect, it } from 'vitest';
import { instagram } from '../../src/parsers/instagram.js';
import { parseAll } from '../../src/parsers/index.js';
import { by, real } from './_load.js';
import { expectMasked } from '../_helpers.js';

/** Real Feb-2026 Instagram JSON export (Dutch-language account) from ccs-amsterdam/r-course-material, sanitized. */
describe('real: instagram (Dutch, 2026)', () => {
  it('parses localized string_map_data keys, profile_searches, single-follower file, off_meta_technologies', async () => {
    const a = real('instagram-nl-2026.zip');
    expect(instagram.detect(a.list())).toBe(true);
    const all = await parseAll(a);
    expect(all.map((r) => r.source)).toEqual(['instagram']);
    const r = all[0];
    expect(by(r.events, 'like')).toBe(8);            // likes_media_likes
    expect(by(r.events, 'comment')).toBe(2);         // post_comments_1.json (English keys)
    expect(by(r.events, 'search')).toBe(7);          // profile_searches.json: searches_user[].string_list_data
    expect(by(r.events, 'login')).toBe(1);           // login_activity.json with "Tijd"/"IP-adres"
    expect(by(r.events, 'off_platform')).toBe(76);   // your_activity_off_meta_technologies.json (plural)
    expect(by(r.claims, 'advertiser_audience')).toBe(109);
    expect(r.claims.find((c) => c.field === 'profile_based_in')?.value).toBe('Bussum');      // "Plaatsnaam"
    expect(r.claims.find((c) => c.field === 'declared_username')?.value).toBe('example.person'); // "Gebruikersnaam"
    expect(r.claims.find((c) => c.field === 'declared_gender')?.value).toBe('unspecified');  // "Geslacht"
    expect(r.claims.find((c) => c.field === 'declared_date_of_birth')?.value).toBe('1990-01-01');
    expect(r.claims.find((c) => c.field === 'followers_count')?.value).toBe('1');
    expect(r.claims.find((c) => c.field === 'following_count')?.value).toBe('3');
    expect(r.claims.find((c) => c.field === 'account_created')?.value).toBe('2021-03-02');  // signup_details.json
    expect(r.events.find((e) => e.kind === 'login')?.meta?.ip).toMatch(/•/);
    expectMasked(r);
    expect(r.warnings).toEqual([]);
  });
});
