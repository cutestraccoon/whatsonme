import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, safeJson, toMs } from '../util/text.js';

/**
 * Snapchat "My Data" (JSON flavour): json/*.json, each a map of section name -> list of rows.
 * Timestamps look like "2024/03/12 10:21:33 UTC". Section names drift between exports, so we
 * walk every object and classify lists by file name + section name + row keys.
 */
export const snapchat: Parser = {
  source: 'snapchat',
  detect: (paths) => paths.some((p) => /(^|\/)json\/(location_history|account_history|chat_history|friends|story_history|account|user_profile|ad_interests|snap_history)\.json$/.test(p)) ||
    paths.some((p) => /snapchat/.test(p) && /\.json$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = byName(a.list(), /(^|\/)json\/[^/]+\.json$|snapchat.*\.json$/);
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    for (const p of paths) {
      const j = safeJson<any>(await a.text(p)); if (!j || typeof j !== 'object') continue; files.push(p);
      const fname = p.slice(p.lastIndexOf('/') + 1);
      walk(j, [], (key, list, path) => {
        const section = path.join(' / ');
        // ---- location history
        if (/location_history/.test(fname) || /location/i.test(section)) {
          for (const it of list) { if (!it || typeof it !== 'object') continue; const t = ts(it); const ll = latLon(it); if (t && ll) events.push({ ts: t, source: 'snapchat', kind: 'location', lat: ll[0], lon: ll[1], title: String(it.Name ?? it.name ?? it['Business Name'] ?? ''), file: p, meta: { section: key } }); }
          return;
        }
        // ---- logins
        if (/login/i.test(key) || (/account_history/.test(fname) && list.some((r) => r && typeof r === 'object' && ('IP' in r || 'Device' in r)))) {
          for (const it of list) { if (!it || typeof it !== 'object') continue; const t = ts(it); if (!t) continue; events.push({ ts: t, source: 'snapchat', kind: 'login', title: String(it.Device ?? it['Device Type'] ?? ''), file: p, meta: { ip: maskIp(String(it.IP ?? it['IP Address'] ?? '')), country: it.Country ?? '', status: it.Status ?? '' } }); }
          return;
        }
        // ---- chats
        if (/chat/i.test(fname) || /chat history/i.test(section)) {
          const dir = /received/i.test(key) ? 'received' : /sent/i.test(key) ? 'sent' : '';
          for (const it of list) { if (!it || typeof it !== 'object') continue; const t = ts(it); if (!t) continue; const peer = String(it.From ?? it.To ?? it.Sender ?? it.Recipient ?? ''); events.push({ ts: t, source: 'snapchat', kind: 'message', actor: peer, title: peer, value: String(it.Content ?? it.Text ?? '').length, file: p, meta: { direction: dir, mediaType: it['Media Type'] ?? it.MediaType ?? '' } }); }
          return;
        }
        // ---- stories
        if (/story/i.test(fname) || /story/i.test(section)) {
          const view = /view/i.test(key);
          for (const it of list) { if (!it || typeof it !== 'object') continue; const t = ts(it); if (!t) continue; events.push({ ts: t, source: 'snapchat', kind: view ? 'watch' : 'post', title: view ? String(it.Name ?? it.Username ?? it['Story Owner'] ?? '') : 'story', file: p, meta: { section: key, mediaType: it['Media Type'] ?? '' } }); }
          return;
        }
        // ---- snaps
        if (/snap_history/.test(fname) || /snap history/i.test(section)) {
          for (const it of list) { if (!it || typeof it !== 'object') continue; const t = ts(it); if (!t) continue; events.push({ ts: t, source: 'snapchat', kind: 'message', actor: String(it.From ?? it.To ?? ''), file: p, meta: { what: 'snap', direction: /received/i.test(key) ? 'received' : 'sent', mediaType: it['Media Type'] ?? '' } }); }
          return;
        }
        // ---- friends: counts only
        if (/friends/.test(fname) || /friend/i.test(key)) {
          claims.push({ source: 'snapchat', field: slug(key) + '_count', value: String(list.length), file: p });
          return;
        }
        // ---- ad interests
        if (/interest/i.test(key) || /interest/i.test(fname) || /ad_interests/.test(fname)) {
          for (const it of list) { const v = typeof it === 'string' ? it : it && typeof it === 'object' ? (it.Name ?? it.name ?? it.Category ?? it.Interest ?? it.category) : null; if (v) claims.push({ source: 'snapchat', field: 'ad_interest', value: String(v), file: p, meta: { section: key } }); }
          return;
        }
        // ---- advertisers / audiences
        if (/advertiser|audience/i.test(key)) {
          for (const it of list) { const v = typeof it === 'string' ? it : it?.Name ?? it?.['Advertiser Name'] ?? it?.name; if (v) claims.push({ source: 'snapchat', field: 'advertiser_audience', value: String(v), file: p }); }
        }
      }, (key, map) => {
        // account.json "Device Information" {Make, Model Name, OS Type, OS Version, User Agent} (keys per RLEAPP's snapAccountinfo)
        if (/^device information$/i.test(key)) { const v = [map.Make, map['Model Name'] ?? map['Model ID'], map['OS Type'], map['OS Version']].filter(Boolean).join(' ') || map['User Agent']; if (v) claims.push({ source: 'snapchat', field: 'device', value: String(v), file: p }); }
        // declared profile fields
        if (/^(basic information|account|user profile|profile)$/i.test(key)) {
          for (const [k, v] of Object.entries(map)) {
            if (v == null || typeof v === 'object') continue;
            const kl = k.toLowerCase();
            if (/username/.test(kl)) claims.push({ source: 'snapchat', field: 'declared_username', value: String(v), file: p });
            else if (/^name$|display name/.test(kl)) claims.push({ source: 'snapchat', field: 'declared_name', value: String(v), file: p });
            else if (/email/.test(kl)) claims.push({ source: 'snapchat', field: 'declared_email', value: mask(String(v)), file: p });
            else if (/phone|mobile/.test(kl)) claims.push({ source: 'snapchat', field: 'declared_phone', value: mask(String(v)), file: p });
            else if (/birth/.test(kl)) { const y = String(v).match(/\d{4}/); if (y) claims.push({ source: 'snapchat', field: 'declared_birth_year', value: y[0], file: p }); }
            else if (/country/.test(kl)) claims.push({ source: 'snapchat', field: 'declared_country', value: String(v), file: p });
            else if (/creation date|created/.test(kl)) claims.push({ source: 'snapchat', field: 'account_created', value: String(v), file: p });
            else if (/carrier/.test(kl)) claims.push({ source: 'snapchat', field: 'carrier', value: String(v), file: p });
            else if (/registration ip/.test(kl)) claims.push({ source: 'snapchat', field: 'signup_ip', value: maskIp(String(v)), file: p });
          }
        }
      });
    }
    if (!events.length && !claims.length) warnings.push('Snapchat: archive recognized but no known json/*.json sections parsed. Did you pick HTML instead of JSON?');
    onProgress?.(`Snapchat: ${events.length} events, ${claims.length} claims`);
    return { source: 'snapchat', events, claims, files, warnings } satisfies ParseResult;
  },
};

function ts(it: any): number | null {
  const raw = it?.Time ?? it?.time ?? it?.Created ?? it?.created ?? it?.Date ?? it?.date ?? it?.Timestamp ?? it?.['Date Created'] ?? it?.['Creation Timestamp'] ?? it?.['Created Time'];
  if (raw == null) return null;
  // "2024/03/12 10:21:33 UTC" -> "2024-03-12 10:21:33Z"
  if (typeof raw === 'string') return toMs(raw.trim().replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3').replace(/\s*UTC$/i, 'Z'));
  return toMs(raw);
}
function latLon(it: any): [number, number] | null {
  const combo = it['Latitude, Longitude'] ?? it['Latitude,Longitude'] ?? it['Lat, Long'];
  if (typeof combo === 'string') { const m = combo.match(/(-?\d+(?:\.\d+)?)[^,]*,\s*(-?\d+(?:\.\d+)?)/); if (m) return [Number(m[1]), Number(m[2])]; }
  const lat = Number(it.Latitude ?? it.latitude ?? it.lat); const lon = Number(it.Longitude ?? it.longitude ?? it.lon ?? it.lng);
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return [lat, lon];
  return null;
}
function walk(node: any, path: string[], onList: (key: string, list: any[], path: string[]) => void, onMap: (key: string, map: any, path: string[]) => void, depth = 0) {
  if (depth > 6 || !node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (Array.isArray(v)) onList(k, v, [...path, k]);
    else if (v && typeof v === 'object') { onMap(k, v, [...path, k]); walk(v, [...path, k], onList, onMap, depth + 1); }
  }
}
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }
function maskIp(s: string) { if (!s) return ''; const v4 = s.split('.'); if (v4.length === 4) return `${v4[0]}.${v4[1]}.•.•`; const v6 = s.split(':'); return v6.length > 2 ? v6.slice(0, 2).join(':') + ':••' : '••'; }
