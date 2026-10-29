import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { basename, byName } from '../util/text.js';

/**
 * WhatsApp "Export chat" (.txt). No JSON, no zone, locale-dependent dates:
 *   Android: "12/03/24, 23:48 - Name: message"   or "3/12/24, 11:48 PM - Name: message"
 *   iOS:     "[2024-03-12, 11:48:10 PM] Name: message" or "[12/03/2024, 23:48:10] Name: message"
 * Lines that don't start with a date are continuations of the previous message. We only keep
 * timestamp, sender and length; message text is never stored.
 */
export const whatsapp: Parser = {
  source: 'whatsapp',
  detect: (paths) => paths.some((p) => /whatsapp[^/]*\.txt$|(^|\/)_chat\.txt$|whatsapp.*\/[^/]+\.txt$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = byName(a.list(), /whatsapp[^/]*\.txt$|(^|\/)_chat\.txt$|whatsapp.*\/[^/]+\.txt$/);
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    for (const p of paths) {
      const txt = (await a.text(p)).replace(/^﻿/, '');
      const lines = txt.split(/\r?\n/);
      const heads = lines.map((l) => HEAD.exec(l.replace(/^[‎‏‪-‮]+/, '')));
      if (!heads.some(Boolean)) continue;
      files.push(p);
      const order = dateOrder(heads);
      const chat = chatName(p);
      const senders = new Map<string, number>(); let media = 0; let last: Event | null = null; let n = 0;
      for (let i = 0; i < lines.length; i++) {
        const m = heads[i];
        if (!m) { if (last && lines[i].trim()) last.value = (last.value ?? 0) + lines[i].length + 1; continue; }
        const [, d1, d2, d3, hh, mm, ss, ampm, rest] = m;
        const t = toTs(d1, d2, d3, hh, mm, ss, ampm, order); if (t == null) { last = null; continue; }
        const body = rest.replace(/^[‎‏]+/, '');
        const sep = body.indexOf(': ');
        if (sep < 1) { last = null; continue; } // system line (encryption notice, joins, etc.)
        const sender = body.slice(0, sep).trim(); const msg = body.slice(sep + 2).replace(/^[\u200e\u200f]+/, ''); // iOS prefixes system/media lines with LRM
        const isMedia = /^[‎‏]?(<media omitted>|<attached: |image omitted|video omitted|audio omitted|sticker omitted|gif omitted|document omitted)/i.test(msg) || /‎<attached:/.test(msg);
        if (isMedia) media++;
        n++; senders.set(sender, (senders.get(sender) ?? 0) + 1);
        last = { ts: t, source: 'whatsapp', kind: 'message', actor: sender, title: chat, value: msg.length, file: p, meta: { media: isMedia, deleted: /^(this message was deleted|you deleted this message)/i.test(msg) } };
        events.push(last);
      }
      claims.push({ source: 'whatsapp', field: 'chat_participants', value: String(senders.size), file: p, meta: { chat, messages: n, media, dateOrder: order } });
      if (senders.size > 2) claims.push({ source: 'whatsapp', field: 'group_chat', value: chat, file: p, meta: { participants: senders.size } });
    }
    if (!events.length) warnings.push('WhatsApp: no parsable chat .txt found (expected "WhatsApp Chat with X.txt" or "_chat.txt").');
    onProgress?.(`WhatsApp: ${events.length} events from ${files.length} chats`);
    return { source: 'whatsapp', events, claims, files, warnings } satisfies ParseResult;
  },
};

const HEAD = /^\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:-\s+|\]\s*)?(.*)$/;

type Order = 'dmy' | 'mdy' | 'ymd';
/** Decide dd/mm vs mm/dd once for the whole file: any first field > 12 means day-first. */
function dateOrder(heads: (RegExpExecArray | null)[]): Order {
  let a12 = false, b12 = false, y4 = false;
  for (const m of heads) { if (!m) continue; if (m[1].length === 4) { y4 = true; break; } if (+m[1] > 12) a12 = true; if (+m[2] > 12) b12 = true; }
  if (y4) return 'ymd';
  if (a12) return 'dmy';
  if (b12) return 'mdy';
  return 'dmy';
}
function toTs(d1: string, d2: string, d3: string, hh: string, mm: string, ss: string | undefined, ampm: string | undefined, order: Order): number | null {
  let Y: number, M: number, D: number;
  // A 4-digit field pins the year for this line even when the file-level guess differs (merged exports mix layouts).
  if (d1.length === 4) order = 'ymd'; else if (order === 'ymd' && d3.length === 4) order = 'dmy';
  if (order === 'ymd') { Y = +d1; M = +d2; D = +d3; }
  else if (order === 'mdy') { M = +d1; D = +d2; Y = +d3; }
  else { D = +d1; M = +d2; Y = +d3; }
  if (Y < 100) Y += Y < 70 ? 2000 : 1900;
  let h = +hh;
  if (ampm) { const pm = /p/i.test(ampm); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  if (M < 1 || M > 12 || D < 1 || D > 31 || h > 23) return null;
  const t = Date.UTC(Y, M - 1, D, h, +mm, +(ss ?? 0));
  return Number.isFinite(t) ? t : null;
}
function chatName(p: string): string {
  const strip = (s: string) => { const m = s.match(/whatsapp chat (?:with|-)\s*(.+)$/i); return (m ? m[1] : s).trim(); };
  const b = basename(p).replace(/\.txt$/, '');
  if (b === '_chat') { const parts = p.split('/'); return parts.length > 1 ? strip(parts[parts.length - 2]) : 'chat'; }
  return strip(b);
}
