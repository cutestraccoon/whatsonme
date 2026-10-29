import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { safeJson, toMs } from '../util/text.js';

/**
 * TikTok "Download your data" (JSON): a single user_data*.json. Section names changed in 2024
 * ("Activity" -> "Your Activity", "Video Browsing History" -> "Watch History"), so we walk the tree
 * and recognise lists by the shape of their items.
 */
export const tiktok: Parser = {
  source: 'tiktok',
  detect: (paths) => paths.some((p) => /user_data.*\.json$/.test(p) || /tiktok/.test(p) || TXT_FILES.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list().filter((p) => /user_data.*\.json$/.test(p) || (/tiktok/.test(p) && p.endsWith('.json')));
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    for (const p of paths) {
      const j = safeJson<any>(await a.text(p)); if (!j) continue; files.push(p);
      walk(j, [], (key, list, path) => {
        const section = path.join(' / ');
        for (const it of list) {
          if (!it || typeof it !== 'object') continue;
          // Keys are localized in some exports (Dutch: "Datum", "Zoekterm", "Reactie", "Methode", "Gedeelde inhoud"); accept the known variants.
          const t = toMs(it.Date ?? it.date ?? it.Datum ?? it.TimeStamp ?? it.Timestamp);
          if (/^VideoList$|WatchHistory|Video Browsing/i.test(key) || /watch history|browsing history/i.test(section)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'watch', url: it.Link ?? it.VideoLink, file: p }); }
          else if (/ItemFavoriteList|Like List|FavoriteVideoList/i.test(key) || /like list/i.test(section)) { const parent = path.slice(0, -1).join(' / '); if (t) events.push({ ts: t, source: 'tiktok', kind: /favorite/i.test(parent) && !/like list/i.test(parent) ? 'save' : 'like', url: it.Link ?? it.link, file: p }); }
          else if (/SearchList/i.test(key)) { const q = it.SearchTerm ?? it['Search Term'] ?? it.Zoekterm; if (t && q) events.push({ ts: t, source: 'tiktok', kind: 'search', title: q, file: p }); }
          else if (/ShareHistoryList/i.test(key)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'share', url: it.Link, title: it.SharedContent ?? it['Gedeelde inhoud'], file: p, meta: { method: it.Method ?? it.Methode } }); }
          else if (/LoginHistoryList/i.test(key)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'login', title: `${it.DeviceModel ?? ''} ${it.DeviceSystem ?? ''}`.trim(), file: p, meta: { ip: maskIp(it.IP), carrier: it.Carrier, network: it.NetworkType } }); if (it.Carrier) claims.push({ source: 'tiktok', field: 'carrier', value: it.Carrier, file: p }); if (it.DeviceModel) claims.push({ source: 'tiktok', field: 'device', value: `${it.DeviceModel} ${it.DeviceSystem ?? ''}`.trim(), file: p }); }
          else if (/CommentsList/i.test(key)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'comment', title: it.Comment ?? it.comment ?? it.Reactie, file: p }); }
          else if (/OffTikTokActivityDataList/i.test(key)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'off_platform', actor: it.Source, title: it.Event, file: p }); }
          else if (/AdInterestCategories/i.test(key)) { if (typeof it === 'string') claims.push({ source: 'tiktok', field: 'ad_interest', value: it, file: p }); }
          else if (/Chat History/i.test(section) && (it.From || it.Content)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'message', actor: it.From, title: key.replace(/^Chat History with |:$/g, ''), value: (it.Content ?? '').length, file: p }); }
          else if (/PurchaseHistory|Purchases/i.test(key)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'purchase', title: it.ProductName ?? it.Product, value: Number(it.Price ?? it.Amount) || undefined, file: p }); }
          else if (/Favorite(Sound|Effect|Hashtag)List|SavedHashtags/i.test(key)) { if (t) events.push({ ts: t, source: 'tiktok', kind: 'save', title: it.Name ?? it.EffectName ?? it.Sound ?? it.Link, file: p, meta: { what: key } }); }
        }
        // string arrays (ad interests) arrive as list of strings
        if (/AdInterestCategories/i.test(key)) for (const s of list) if (typeof s === 'string') claims.push({ source: 'tiktok', field: 'ad_interest', value: s, file: p });
      }, (key, map, path) => {
        if (/ProfileMap/i.test(key)) { for (const k of ['userName', 'birthDate', 'emailAddress', 'telephoneNumber', 'bioDescription']) if (map[k]) claims.push({ source: 'tiktok', field: 'declared_' + k, value: k === 'emailAddress' || k === 'telephoneNumber' ? mask(String(map[k])) : String(map[k]), file: p }); }
        if (/SettingsMap|App Settings/i.test(key)) { for (const k of ['Device Model', 'Country Region', 'Language', 'Advertising ID', 'Operating System']) if (map[k]) claims.push({ source: 'tiktok', field: 'setting_' + k.toLowerCase().replace(/ /g, '_'), value: String(map[k]), file: p }); }
      });
    }
    if (!files.length) await parseTxt(a, a.list().filter((p) => TXT_FILES.test(p)), events, claims, files, warnings);
    if (!files.length) warnings.push('TikTok: no user_data*.json or TXT folder found. TikTok offers JSON or TXT; both are supported.');
    onProgress?.(`TikTok: ${events.length} events, ${claims.length} claims`);
    return { source: 'tiktok', events, claims, files, warnings } satisfies ParseResult;
  },
};

function walk(node: any, path: string[], onList: (key: string, list: any[], path: string[]) => void, onMap: (key: string, map: any, path: string[]) => void, depth = 0) {
  if (depth > 8 || !node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (Array.isArray(v)) onList(k, v, [...path, k]);
    else if (v && typeof v === 'object') { onMap(k, v, [...path, k]); walk(v, [...path, k], onList, onMap, depth + 1); }
  }
}
function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }

function maskIp(ip: unknown): string { const s = String(ip ?? ''); const m = s.match(/^(\d+\.\d+)\.\d+\.\d+$/); if (m) return m[1] + '.•.•'; if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + ':••'; return s; }

/** TikTok's TXT export: a TikTok/ folder of .txt files, blank-line-separated "Key: value" blocks (dates end in " UTC"). */
const TXT_FILES = /(^|\/)(watch history|video browsing history|like list|favorite videos|favorite comments|favorite effects|favorite places|favorite sounds|searches|search history|login history|share history|comments|direct messages|chat history|ad interests|off tiktok activity|ads link history|profile information|profile info|settings|follower|follower list|following|following list|block list|purchases?|hashtag|status|most recent location data|profile views|watch live history|livestream comment|autofill|third party info|reposts|posts)\.txt$/i;
async function parseTxt(a: Archive, paths: string[], events: Event[], claims: Claim[], files: string[], warnings: string[]) {
  const blocks = (txt: string) => txt.replace(/\r/g, '').split(/\n\s*\n|\n-{5,}\s*\n/).map((b) => { const m: Record<string, string> = {}; for (const line of b.split('\n')) { const i = line.indexOf(':'); if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && !(k in m)) m[k] = v; } } return m; }).filter((m) => Object.keys(m).length);
  const T = (m: Record<string, string>) => toMs((m.Date ?? m.date ?? m['Date and time'] ?? m['Comment Time'] ?? m['Create Date'] ?? m.TimeStamp ?? m.Timestamp ?? '').replace(/ UTC$/, 'Z').replace(' ', 'T'));
  const maskIp = (ip: string) => { const mm = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/); return mm ? mm[1] + '.•.•' : ip.includes(':') ? ip.split(':').slice(0, 3).join(':') + ':••' : ip; };
  const maskPii = (v: string) => v.replace(/[^@. ](?=[^@. ]{2})/g, '•');
  const na = (v?: string) => !v || /^(n\/a|none|-)$/i.test(v);
  for (const p of paths) {
    const name = p.split('/').pop()!.toLowerCase().replace(/\.txt$/, ''); const txt = await a.text(p); if (/you have no data|you have no third-party/i.test(txt) && txt.length < 200) continue; files.push(p); const bs = blocks(txt);
    if (/watch history|video browsing history/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'watch', url: m.Link || undefined, file: p }); }
    else if (name === 'like list') for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'like', url: m.Link, file: p }); }
    else if (/^favorite (videos|comments|effects|places|sounds)|hashtag/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'save', url: m.Link, title: m.Name ?? m.Sound ?? m.Effect ?? m.Hashtag ?? m['Place Name'], file: p, meta: { what: name } }); }
    else if (/^searches|search history/.test(name)) for (const m of bs) { const t = T(m); const q = m['Search Term'] ?? m.SearchTerm ?? m.Term; if (t && q) events.push({ ts: t, source: 'tiktok', kind: 'search', title: q, file: p }); }
    else if (/login history/.test(name)) { const devs = new Set<string>(); for (const m of bs) { const t = T(m); const dm = m['Device Model'] ?? m.DeviceModel, ds = m['Device System'] ?? m.DeviceSystem; if (t) events.push({ ts: t, source: 'tiktok', kind: 'login', title: `${dm ?? ''} ${ds ?? ''}`.trim(), file: p, meta: { ip: maskIp(m.IP ?? m['IP Address'] ?? ''), carrier: m.Carrier || undefined, network: m['Network Type'] ?? m.NetworkType } }); if (m.Carrier) claims.push({ source: 'tiktok', field: 'carrier', value: m.Carrier, file: p }); if (dm) devs.add(`${dm} ${ds ?? ''}`.trim()); } for (const d of devs) claims.push({ source: 'tiktok', field: 'device', value: d, file: p }); }
    else if (/share history/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'share', url: m.Link, title: m['Shared Content'] ?? m.SharedContent, file: p, meta: { method: m.Method } }); }
    else if (name === 'comments') for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'comment', value: (m.Comment ?? '').length, url: na(m['Original Post Link']) ? undefined : m['Original Post Link'], file: p }); }
    else if (/livestream comment/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'comment', value: (m.Comment ?? '').length, file: p, meta: { what: 'live_comment', room: m['Room ID'] } }); }
    else if (/watch live history/.test(name)) { for (const b of txt.replace(/\r/g, '').split(/\n(?=Date and time:)/)) { const m = blocks(b)[0] ?? {}; const t = T(m); if (t) { const n = (b.match(/^\[\d{4}-\d{2}-\d{2} /gm) ?? []).length; events.push({ ts: t, source: 'tiktok', kind: 'watch', url: m.Link || undefined, file: p, meta: { what: 'live', comments: n } }); } } }
    else if (/direct messages|chat history/.test(name)) { const before = events.length; let thread = ''; for (const line of txt.replace(/\r/g, '').split('\n')) { const h = line.match(/^>>>\s*Chat History with ([^:]+):/); if (h) { thread = h[1].trim(); continue; } const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?: UTC)?\s+([^:]+):\s?(.*)$/); if (m) { const t = toMs(m[1].replace(' ', 'T') + 'Z'); if (t) events.push({ ts: t, source: 'tiktok', kind: 'message', actor: m[2].trim(), title: thread, value: m[3].length, file: p, meta: { media: /tiktokv\.com\/share|https?:\/\//.test(m[3]) } }); } }
      // older layout: blocks of Date:/From:/Content: under each ">>> Chat History with" header
      if (events.length === before) { let th = ''; for (const raw of txt.replace(/\r/g, '').split(/\n\s*\n/)) { const h = raw.match(/>>>\s*Chat History with ([^:\n]+):?/i); if (h) th = h[1].trim(); const m: Record<string, string> = {}; for (const line of raw.split('\n')) { const i = line.indexOf(':'); if (i > 0 && !line.startsWith('>>>')) { const k = line.slice(0, i).trim(); if (!(k in m)) m[k] = line.slice(i + 1).trim(); } } const t = T(m); if (t && (m.From || m.Content != null)) events.push({ ts: t, source: 'tiktok', kind: 'message', actor: m.From, title: th, value: (m.Content ?? '').length, file: p }); } } const me = claims.find((c) => c.field === 'declared_username')?.value; if (me) for (const e of events) if (e.source === 'tiktok' && e.kind === 'message') e.meta = { ...(e.meta ?? {}), from_me: e.actor === me }; }
    else if (/ad interests/.test(name)) { for (const m of bs) for (const [k, v] of Object.entries(m)) if (/interest|categor/i.test(k)) for (const c of v.split(/,|\n/)) if (c.trim()) claims.push({ source: 'tiktok', field: 'ad_interest', value: c.trim(), file: p }); for (const line of txt.split('\n')) if (/^\s*[-•]\s*\S/.test(line)) claims.push({ source: 'tiktok', field: 'ad_interest', value: line.replace(/^\s*[-•]\s*/, '').trim(), file: p }); }
    else if (/ads link history/.test(name)) for (const m of bs) { const t = T(m); if (t) { let host = ''; try { host = new URL(m['Ad Link'] ?? '').hostname.replace(/^www\./, ''); } catch { /* ignore */ } events.push({ ts: t, source: 'tiktok', kind: 'ad_click', title: m['Ad Title'], actor: host || undefined, url: (m['Ad Link'] ?? '').split('?')[0] || undefined, file: p }); } }
    else if (/off tiktok activity/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'off_platform', actor: /^\d+$/.test(m.Source ?? '') ? `Partner app #${m.Source}` : (m.Source ?? m.Partner), title: /^\d+$/.test(m.Event ?? '') ? `event ${m.Event}` : (m.Event ?? m['Event Type']), file: p }); }
    else if (/most recent location data/.test(name)) for (const m of bs) { const t = T(m); const g = (m['GPS Data'] ?? '').split(',').map((x) => Number(x.trim())); if (g.length === 2 && g.every(Number.isFinite)) { const [lon, lat] = Math.abs(g[0]) > 90 ? g : [g[1], g[0]]; claims.push({ source: 'tiktok', field: 'last_known_location', value: `${lat.toFixed(2)}, ${lon.toFixed(2)}${m['Last Region'] ? ' · ' + m['Last Region'] : ''}`, file: p }); if (t) events.push({ ts: t, source: 'tiktok', kind: 'location', title: m['Last Region'] ?? 'last known location', lat, lon, file: p, meta: { semantic: 'LAST_KNOWN' } }); } else if (m['Last Region']) claims.push({ source: 'tiktok', field: 'last_known_location', value: m['Last Region'], file: p }); }
    else if (/profile views/.test(name)) for (const m of bs) { const t = T(m); if (t && m.Username) events.push({ ts: t, source: 'tiktok', kind: 'other', actor: m.Username, title: 'profile view', file: p, meta: { what: 'profile_view' } }); }
    else if (name === 'status') { const vers = new Set<string>(), ids = new Set<string>(); for (const m of bs) { if (m['App Version']) vers.add(m['App Version']); for (const k of ['IDFV', 'IDFA', 'GAID', 'Android ID', 'Web ID']) if (!na(m[k])) ids.add(k); if (m['Screen Resolution'] && !claims.some((c) => c.field === 'screen' && c.value === m['Screen Resolution'])) claims.push({ source: 'tiktok', field: 'screen', value: m['Screen Resolution'], file: p }); } if (vers.size) claims.push({ source: 'tiktok', field: 'app_versions_seen', value: String(vers.size), file: p }); for (const k of ids) claims.push({ source: 'tiktok', field: 'device_identifier', value: k, file: p }); }
    else if (/profile information|profile info/.test(name)) for (const m of bs) for (const [k, v] of Object.entries(m)) { if (na(v) || /photo|video/i.test(k)) continue; if (/^(username)/i.test(k)) claims.push({ source: 'tiktok', field: 'declared_username', value: v, file: p }); else if (/nickname|birth ?date|account region|bio|description/i.test(k)) claims.push({ source: 'tiktok', field: 'declared_' + k.toLowerCase().replace(/[^a-z]+/g, '_'), value: v, file: p }); else if (/email|phone|telephone/i.test(k)) claims.push({ source: 'tiktok', field: 'declared_' + k.toLowerCase().replace(/[^a-z]+/g, '_'), value: maskPii(v), file: p }); }
    else if (name === 'settings') for (const m of bs) for (const [k, v] of Object.entries(m)) if (/personalized ads|private account|suggest your account|who can|allow download|device model|country|language|operating system|ad authorization/i.test(k) && v) claims.push({ source: 'tiktok', field: 'setting_' + k.toLowerCase().replace(/[^a-z]+/g, '_').replace(/_$/, ''), value: v, file: p });
    else if (/^autofill/.test(name)) { const has = bs.flatMap((m) => Object.entries(m).filter(([, v]) => !na(v)).map(([k]) => k.toLowerCase())); if (has.length) claims.push({ source: 'tiktok', field: 'autofill_on_file', value: [...new Set(has)].join(', '), file: p }); }
    else if (/^follower/.test(name)) claims.push({ source: 'tiktok', field: 'followers_count', value: String(bs.filter((m) => m.Username).length), file: p });
    else if (/^following/.test(name)) claims.push({ source: 'tiktok', field: 'following_count', value: String(bs.filter((m) => m.Username).length), file: p });
    else if (/block list/.test(name)) claims.push({ source: 'tiktok', field: 'blocked_count', value: String(bs.filter((m) => m.Username).length), file: p });
    else if (/third party info/.test(name)) { for (const m of bs) for (const [k, v] of Object.entries(m)) if (!na(v)) claims.push({ source: 'tiktok', field: 'third_party_login', value: k, file: p }); }
    else if (/purchase/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'purchase', title: m.Product ?? m['Product Name'], value: Number(String(m.Price ?? m.Amount ?? '').replace(/[^\d.]/g, '')) || undefined, file: p }); }
    else if (/^(posts|reposts)/.test(name)) for (const m of bs) { const t = T(m); if (t) events.push({ ts: t, source: 'tiktok', kind: 'post', url: m.Link, title: name, file: p }); }
  }
  // DM direction once username is known (profile file may come after messages)
  const me = claims.find((c) => c.field === 'declared_username')?.value; if (me) for (const e of events) if (e.source === 'tiktok' && e.kind === 'message' && e.meta?.from_me == null) e.meta = { ...(e.meta ?? {}), from_me: e.actor === me };
  if (files.length) warnings.push('TikTok: parsed the TXT export. Ad interests are not included in TXT; the JSON export adds them.');
}
