import { describe, expect, it } from 'vitest';
import { x } from '../src/parsers/x.js';
import { makeXArchive } from './fixtures/x.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('x (twitter) parser', () => {
  it('parses tweets, DMs, ads, logins and personalization', async () => {
    const res = await checkParser(x, makeXArchive(), { kinds: ['post', 'message', 'ad_view', 'ad_click', 'login'], minEvents: 150,
      claimFields: ['likes_count', 'inferred_gender', 'inferred_age', 'ad_interest', 'advertiser_audience', 'lookalike_advertiser', 'location_history', 'inferred_show', 'inferred_language', 'declared_username', 'account_created'] });
    expect(res.events.filter((e) => e.kind === 'post').length).toBe(70);
    expect(res.events.filter((e) => e.kind === 'ad_view').length).toBe(90);
    expect(res.events.filter((e) => e.kind === 'ad_click').length).toBe(12);
    expect(res.events.filter((e) => e.kind === 'login').length).toBe(30);
    expect(res.events.filter((e) => e.kind === 'like').length).toBe(0); // likes carry no timestamp
    expect(res.claims.find((c) => c.field === 'likes_count')?.value).toBe('150');
    expect(res.claims.find((c) => c.field === 'inferred_age')?.value).toBe('25-34');
    expect(res.claims.filter((c) => c.field === 'ad_interest').length).toBe(10);
    expect(res.events.find((e) => e.kind === 'ad_view')?.actor).toBeTruthy();
    expect(res.events.find((e) => e.kind === 'post')?.meta?.source).toBe('Twitter for iPhone');
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
