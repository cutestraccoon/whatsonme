import type { MapArchive } from '../../src/util/archive.js';
import { NAMES, archive, pad, randomTs, rng } from './_rng.js';

const LINES = ['hey', 'you around?', 'yeah give me 10 min', 'ok see you at the usual spot', 'did you see the game last night', 'sending the doc now', 'lol', 'call me when you can', 'running late, sorry', 'this is a longer message that goes on for a while to vary the lengths a bit'];

/** Android, 24h, dd/mm/yy: "12/03/24, 23:48 - Name: message" */
function android(ms: number, who: string, msg: string): string { const d = new Date(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} - ${who}: ${msg}`; }
/** iOS, 12h, yyyy-mm-dd: "[2024-03-12, 11:48:10 PM] Name: message" */
function ios(ms: number, who: string, msg: string): string { const d = new Date(ms); const h = d.getUTCHours(); const h12 = h % 12 === 0 ? 12 : h % 12; return `[${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}, ${h12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}] ${who}: ${msg}`; }
/** US-style Android, 12h, m/d/yy: "3/12/24, 11:48 PM - Name: message" */
function androidUs(ms: number, who: string, msg: string): string { const d = new Date(ms); const h = d.getUTCHours(); const h12 = h % 12 === 0 ? 12 : h % 12; return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}, ${h12}:${pad(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'} - ${who}: ${msg}`; }

/** Three exported chats: Android 1:1, iOS group (_chat.txt), US-locale Android. */
export function makeWhatsappArchive(): MapArchive {
  const r = rng(11);
  const chat = (fmt: (ms: number, who: string, msg: string) => string, people: string[], n: number, header: string[]) => {
    const ts = Array.from({ length: n }, () => randomTs(r)).sort((a, b) => a - b);
    const out = [...header];
    for (const t of ts) {
      const who = r.pick(people);
      if (r.chance(0.12)) { out.push(fmt(t, who, '‎<Media omitted>')); continue; }
      out.push(fmt(t, who, r.pick(LINES)));
      if (r.chance(0.15)) { out.push('second line of the same message'); out.push('and a third'); }
    }
    return out.join('\n') + '\n';
  };
  const d0 = (fmt: (ms: number, who: string, msg: string) => string) => fmt(Date.UTC(2024, 0, 14, 9, 0), '', '').replace(/ - : $/, ' - ').replace(/\] : $/, '] ');
  return archive({
    'WhatsApp Chat with Omar.txt': chat(android, ['Omar', 'Ferris'], 120, [d0(android) + '‎Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.']),
    'WhatsApp Chat - Hafla planning/_chat.txt': chat(ios, ['Ferris', ...NAMES.slice(0, 4)], 90, ['‎' + d0(ios) + '‎Ferris created group "Hafla planning"', '‎' + d0(ios) + '‎Ferris added Layla']),
    'WhatsApp Chat with Sam.txt': chat(androidUs, ['Sam', 'Ferris'], 60, [d0(androidUs) + 'Messages and calls are end-to-end encrypted.']),
    'WhatsApp Chat - Hafla planning/00000012-PHOTO-2024-03-02-19-22-10.jpg': new Uint8Array([0xff, 0xd8, 0xff]),
  });
}
