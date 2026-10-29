import type { Archive, Parser, ParseResult } from '../types.js';
import { instagram } from './instagram.js';
import { tiktok } from './tiktok.js';
import { google } from './google.js';
import { apple } from './apple.js';
import { spotify } from './spotify.js';
import { x } from './x.js';
import { snapchat } from './snapchat.js';
import { uber } from './uber.js';
import { whatsapp } from './whatsapp.js';
import { tinder, hinge, bumble } from './dating.js';
import { steam, discord } from './gaming.js';

/** Deep-audit parsers register themselves by being added here. */
export const parsers: Parser[] = [instagram, tiktok, google, apple, spotify, x, snapchat, uber, whatsapp, tinder, hinge, bumble, steam, discord];

export function registerParser(p: Parser) { if (!parsers.some((x) => x.source === p.source)) parsers.push(p); }

export function detectSources(archive: Archive): Parser[] {
  const paths = archive.list();
  return parsers.filter((p) => p.detect(paths));
}

export async function parseAll(archive: Archive, onProgress?: (msg: string) => void): Promise<ParseResult[]> {
  const found = detectSources(archive);
  onProgress?.(`Detected: ${found.map((f) => f.source).join(', ') || 'nothing'}`);
  const out: ParseResult[] = [];
  for (const p of found) {
    try { out.push(await p.parse(archive, onProgress)); }
    catch (e) { out.push({ source: p.source, events: [], claims: [], files: [], warnings: [`${p.source}: parser crashed: ${(e as Error).message}`] }); }
  }
  return out;
}
export { instagram, tiktok, google, apple, spotify, x, snapchat, uber, whatsapp, tinder, hinge, bumble, steam, discord };
