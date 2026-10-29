import type { Claim, Event } from '../types.js';
import { text } from './instagram-html.js';

/**
 * Google Takeout "My Activity" in HTML format (the default Takeout offers). One file per product
 * (My Activity/<Product>/MyActivity.html). Each entry is an `outer-cell` block:
 *   header-cell:   product name
 *   content-cell:  "Searched for&nbsp;<a href=...>query</a><br>Mar 8, 2018, 5:14:40 PM PDT"
 *   caption cell:  <b>Products:</b> … <b>Details:</b> From Google Ads … <b>Locations:</b> From your home: <a href=maps?q=lat,lon>
 * No DOM (this runs in a worker): split on the outer-cell marker and read with regexes.
 */
export interface HtmlActivity { product: string; action: string; title: string; url?: string; ts: number | null; details: string[]; location?: string; latLon?: [number, number] }

export function parseActivityHtml(html: string, product: string): HtmlActivity[] {
  const out: HtmlActivity[] = [];
  const parts = html.split(/<div[^>]*class="[^"]*\bouter-cell\b[^"]*"[^>]*>/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const header = text(chunk.match(/<div[^>]*class="[^"]*\bheader-cell\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '') || product;
    const cells = [...chunk.matchAll(/<div[^>]*class="[^"]*\bcontent-cell\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
    const body = cells.find((c) => STAMP.test(text(c))) ?? cells[0] ?? '';
    const flat = text(body);
    const m = flat.match(STAMP);
    const ts = m ? stampToMs(m) : null;
    const before = m ? flat.slice(0, m.index).trim() : flat;
    const url = body.match(/<a[^>]+href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const am = before.match(/^(Searched for|Watched|Visited|Viewed|Used|Listened to|Opened|Said|Asked|Received|Read|Played|Clicked|Liked|Disliked|Saved|Subscribed to|Launched|Installed|Typed|Looked at|Checked out|Reached|Navigated to|Took)\s+(.*)$/i);
    const action = am ? am[1] : ''; const title = (am ? am[2] : before).trim();
    const caption = text(cells.filter((c) => /<b>\s*(Products|Details|Locations|Why is this here)\s*:?\s*<\/b>/i.test(c)).join(' '));
    const details = caption.match(/Details:\s*(.*?)(?=\s*(Products|Locations|Why is this here):|$)/)?.[1]?.split(/\s{2,}|(?<=\S) (?=From Google Ads)/).map((s) => s.trim()).filter(Boolean) ?? [];
    const locM = caption.match(/Locations:\s*(.*?)(?=\s*(Products|Details|Why is this here):|$)/);
    const location = locM?.[1]?.replace(/https?:\/\/\S+/g, '').trim() || undefined;
    const ll = cells.join(' ').match(/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    out.push({ product: header, action, title, url, ts, details, location, latLon: ll ? [Number(ll[1]), Number(ll[2])] : undefined });
  }
  return out;
}

// "Mar 8, 2018, 5:14:40 PM PDT"  (older exports omit the zone and are UTC; "UTC" appears in 2018-2020 exports; later ones carry the exporter's local zone)
const STAMP = /\b([A-Z][a-z]{2}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s?([AP]M)(?:\s+([A-Z]{2,5}|UTC[+-]\d{1,2}(?::\d{2})?|GMT[+-]\d{1,2}(?::\d{2})?))?/;
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** Zone abbreviations -> minutes east of UTC. Ambiguous ones (IST, CST) take the most common meaning; unknown ones are read as UTC. */
const ZONES: Record<string, number> = { UTC: 0, GMT: 0, Z: 0, WET: 0, BST: 60, IST: 60, WEST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, MSK: 180, SAST: 120, CAT: 120, EAT: 180, GST: 240, PKT: 300, NPT: 345, BDT: 360, ICT: 420, WIB: 420, CST: -360, HKT: 480, SGT: 480, AWST: 480, PHT: 480, JST: 540, KST: 540, ACST: 570, ACDT: 630, AEST: 600, AEDT: 660, NZST: 720, NZDT: 780, EST: -300, EDT: -240, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420, AKST: -540, AKDT: -480, HST: -600, AST: -240, ADT: -180, NST: -210, NDT: -150, BRT: -180, ART: -180, CLT: -240 };
export function stampToMs(m: RegExpMatchArray): number | null {
  const mo = MONTHS[m[1].toLowerCase()]; if (mo == null) return null;
  let h = Number(m[4]); const ap = m[7].toUpperCase(); if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
  let t = Date.UTC(Number(m[3]), mo, Number(m[2]), h, Number(m[5]), Number(m[6] ?? 0));
  const z = m[8];
  if (z) { const off = z.match(/^(?:UTC|GMT)([+-])(\d{1,2})(?::(\d{2}))?$/); const min = off ? (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3] ?? 0)) : ZONES[z] ?? 0; t -= min * 60000; }
  return t;
}

export function activityToEvent(a: HtmlActivity, product: string, file: string, claims: Claim[]): Event | null {
  if (!a.ts) return null;
  const act = a.action.toLowerCase();
  let kind: Event['kind'] = 'other';
  if (act === 'searched for') kind = 'search';
  else if (act === 'watched' || act === 'listened to' || act === 'played') kind = 'watch';
  else if (act === 'visited') kind = 'visit';
  else if (act === 'viewed') kind = /ad/i.test(product) ? 'ad_view' : 'visit';
  else if (act === 'used' || act === 'opened' || act === 'launched') kind = 'session';
  if (/ads/i.test(product) && kind === 'other') kind = 'ad_view';
  const src = /youtube/i.test(product) ? 'youtube' : 'google';
  if (/ads/i.test(product)) for (const d of a.details) claims.push({ source: 'google', field: 'ad_detail', value: d, file });
  return { ts: a.ts, source: src, kind, title: a.title, url: a.url, lat: a.latLon?.[0], lon: a.latLon?.[1], file, meta: { product, ad: a.details.some((d) => /from google ads/i.test(d)), location: a.location, html: true } };
}
