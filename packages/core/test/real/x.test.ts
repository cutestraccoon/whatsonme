import { describe, expect, it } from 'vitest';
import { x } from '../../src/parsers/x.js';
import { real } from './_load.js';
import { expectMasked } from '../_helpers.js';

describe('real: x / twitter archive', () => {
  it('tweets.js re-published with a module.exports wrapper (StevenClontz) + account/follower/following (dogsheep)', async () => {
    const a = real('x');
    expect(x.detect(a.list())).toBe(true);
    const r = await x.parse(a);
    expect(r.events.filter((e) => e.kind === 'post').length).toBe(25);
    expect(r.events[0].ts).toBe(Date.UTC(2024, 7, 11, 14, 49, 9));
    expect(r.events[0].meta?.source).toBe('Twitter Web App');
    expect(r.claims.find((c) => c.field === 'declared_username')?.value).toBe('example');
    expect(r.claims.find((c) => c.field === 'followers_count')?.value).toBe('2');
    expect(r.claims.find((c) => c.field === 'following_count')?.value).toBe('2');
    expect(r.claims.find((c) => c.field === 'account_created')?.value).toBe('2006-11-15T13:18:50.000Z');
    expectMasked(r);
  });
});
