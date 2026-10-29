import { describe, expect, it } from 'vitest';
import { whatsapp } from '../../src/parsers/whatsapp.js';
import { real } from './_load.js';

describe('real-shaped: whatsapp iOS _chat.txt (timelinize fixture)', () => {
  it('handles LRM marks, multi-line messages, attachments, polls, mixed date separators', async () => {
    const a = real('whatsapp');
    expect(whatsapp.detect(a.list())).toBe(true);
    const r = await whatsapp.parse(a);
    expect(r.events.length).toBe(19);                 // 19 headers; 7 continuation lines fold into the previous message
    expect(r.events.filter((e) => e.meta?.media).length).toBe(3);
    expect(r.events.filter((e) => e.meta?.deleted).length).toBe(2);
    expect(new Set(r.events.map((e) => e.actor)).size).toBe(4);
    expect(r.events[0].ts).toBe(Date.UTC(2020, 0, 1, 12, 0, 1));
    expect(r.events.at(-1)!.ts).toBe(Date.UTC(2025, 6, 1, 12, 0, 19)); // dd/mm/yyyy line inside a yyyy-mm-dd file
    expect(r.claims.find((c) => c.field === 'group_chat')).toBeTruthy();
  });
});
