import { describe, expect, it } from 'vitest';
import { whatsapp } from '../src/parsers/whatsapp.js';
import { makeWhatsappArchive } from './fixtures/whatsapp.js';
import { checkParser } from './_helpers.js';

describe('whatsapp parser', () => {
  it('parses Android (24h dd/mm), iOS (12h, bracketed) and US-locale chats without storing content', async () => {
    const res = await checkParser(whatsapp, makeWhatsappArchive(), { kinds: ['message'], minEvents: 250, claimFields: ['chat_participants', 'group_chat'] });
    expect(res.events.length).toBe(270);
    expect(res.files.length).toBe(3);
    const byChat = new Map<string, number>(); for (const e of res.events) byChat.set(e.title!, (byChat.get(e.title!) ?? 0) + 1);
    expect(byChat.get('omar')).toBe(120); expect(byChat.get('hafla planning')).toBe(90); expect(byChat.get('sam')).toBe(60);
    expect(res.events.every((e) => e.actor && typeof e.value === 'number' && !('content' in (e.meta ?? {})) && !e.url)).toBe(true);
    // multi-line continuations add to the previous message's length, so some are long
    expect(res.events.some((e) => (e.value ?? 0) > 60)).toBe(true);
    expect(res.events.some((e) => e.meta?.media === true)).toBe(true);
    // whole-file date-order resolution: the US-locale chat still lands inside the fixture window
    const sam = res.events.filter((e) => e.title === 'sam');
    expect(Math.min(...sam.map((e) => e.ts))).toBeGreaterThanOrEqual(Date.UTC(2024, 0, 15));
    expect(Math.max(...sam.map((e) => e.ts))).toBeLessThanOrEqual(Date.UTC(2024, 9, 1));
    expect(res.claims.find((c) => c.field === 'chat_participants' && c.meta?.chat === 'sam')?.meta?.dateOrder).toBe('mdy');
    expect(res.claims.find((c) => c.field === 'chat_participants' && c.meta?.chat === 'omar')?.meta?.dateOrder).toBe('dmy');
    expect(res.claims.find((c) => c.field === 'chat_participants' && c.meta?.chat === 'hafla planning')?.meta?.dateOrder).toBe('ymd');
    expect(res.warnings).toEqual([]);
  });
});
