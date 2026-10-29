import { describe, expect, it } from 'vitest';
import { discord } from '../src/parsers/gaming.js';
import { makeDiscordArchive } from './fixtures/discord.js';
import { checkParser, expectMasked } from './_helpers.js';

describe('discord parser', () => {
  it('parses messages (json + csv), analytics sessions and account', async () => {
    const res = await checkParser(discord, makeDiscordArchive(), { kinds: ['message', 'session', 'play', 'other', 'purchase'], minEvents: 300,
      claimFields: ['declared_username', 'declared_email', 'channels_messaged', 'device_os', 'location_history', 'servers_count', 'friends_count', 'connected_account'] });
    const msgs = res.events.filter((e) => e.kind === 'message');
    expect(msgs.length).toBe(220);
    expect(msgs.every((e) => typeof e.value === 'number' && e.title && !('content' in (e.meta ?? {})))).toBe(true);
    expect(msgs.filter((e) => e.meta?.channel === 'dm').length).toBe(100);
    expect(msgs.some((e) => e.title === 'Gaming Lounge / cs2')).toBe(true); // csv channel
    expect(res.events.filter((e) => e.kind === 'session').length).toBeGreaterThan(50);
    expect(res.claims.find((c) => c.field === 'declared_username')?.value).toBe('alexsample');
    expect(res.claims.find((c) => c.field === 'friends_count')?.value).toBe('20');
    expect(res.claims.find((c) => c.field === 'servers_count')?.value).toBe('3');
    expectMasked(res);
    expect(res.warnings).toEqual([]);
  });
});
