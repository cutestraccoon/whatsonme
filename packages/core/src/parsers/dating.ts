import type { Archive, Claim, Event, Kind, Parser, ParseResult } from '../types.js';
import { byName, parseCsv, safeJson, toMs } from '../util/text.js';

/* ------------------------------------------------------------------------------------------ */
/* Tinder: a single data.json                                                                  */
/* ------------------------------------------------------------------------------------------ */

/**
 * Tinder "Download my data": data.json with Usage (per-day counters), User (declared profile),
 * Messages (sent only — Tinder does not export what others wrote).
 */
export const tinder: Parser = {
  source: 'tinder',
  // A bare data.json also appears inside Google Takeout ("Google Business Profile/account-…/data.json"), so ignore those.
  detect: (paths) => paths.some((p) => /tinder/.test(p) && /\.json$/.test(p)) || paths.some((p) => /(^|\/)data\.json$/.test(p) && !/takeout|google/.test(p) && !paths.some((q) => /hinge|bumble/.test(q))),
  async parse(a: Archive, onProgress) {
    const paths = byName(a.list(), /(^|\/)data\.json$|tinder.*\.json$/);
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    for (const p of paths) {
      const j = safeJson<any>(await a.text(p)); if (!j || typeof j !== 'object' || !(j.Usage || j.User || j.Messages)) continue; files.push(p);
      const u = j.Usage ?? {};
      const daily: [string, Kind, Record<string, string>][] = [
        ['app_opens', 'session', { what: 'app_open' }], ['swipes_likes', 'swipe', { direction: 'like' }], ['swipes_passes', 'swipe', { direction: 'pass' }],
        ['superlikes', 'swipe', { direction: 'superlike' }], ['matches', 'match', {}], ['messages_sent', 'message', { direction: 'sent' }], ['messages_received', 'message', { direction: 'received' }],
      ];
      for (const [key, kind, meta] of daily) {
        const map = u[key]; if (!map || typeof map !== 'object') continue;
        for (const [day, cnt] of Object.entries(map)) { const n = Number(cnt); const t = toMs(day + ' 12:00'); if (!t || !n) continue; events.push({ ts: t, source: 'tinder', kind, value: n, file: p, meta: { ...meta, daily: true } }); }
      }
      const usr = j.User ?? {};
      const yr = String(usr.birth_date ?? '').match(/\d{4}/); if (yr) claims.push({ source: 'tinder', field: 'declared_birth_year', value: yr[0], file: p });
      if (usr.gender != null) claims.push({ source: 'tinder', field: 'declared_gender', value: gender(usr.gender), file: p });
      if (usr.interested_in != null) claims.push({ source: 'tinder', field: 'interested_in', value: gender(usr.interested_in), file: p });
      const city = usr.city?.name ?? usr.city; if (city && typeof city === 'string') claims.push({ source: 'tinder', field: 'declared_city', value: city, file: p });
      if (usr.create_date) claims.push({ source: 'tinder', field: 'account_created', value: String(usr.create_date), file: p });
      if (usr.email) claims.push({ source: 'tinder', field: 'declared_email', value: mask(String(usr.email)), file: p });
      if (usr.phone_id || usr.phone) claims.push({ source: 'tinder', field: 'declared_phone', value: mask(String(usr.phone ?? usr.phone_id)), file: p });
      for (const job of usr.jobs ?? []) { const v = job?.title?.name ?? job?.company?.name; if (v) claims.push({ source: 'tinder', field: 'declared_job', value: String(v), file: p }); }
      for (const s of usr.schools ?? []) if (s?.name) claims.push({ source: 'tinder', field: 'declared_school', value: String(s.name), file: p });
      if (usr.age_filter_min != null && usr.age_filter_max != null) claims.push({ source: 'tinder', field: 'age_filter', value: `${usr.age_filter_min}-${usr.age_filter_max}`, file: p });
      if (usr.ip_address) claims.push({ source: 'tinder', field: 'last_ip', value: maskIp(String(usr.ip_address)), file: p });
      if (j.Spotify?.spotify_connected != null) claims.push({ source: 'tinder', field: 'spotify_connected', value: String(!!j.Spotify.spotify_connected), file: p });
      let matches = 0;
      for (const conv of Array.isArray(j.Messages) ? j.Messages : []) {
        matches++;
        for (const m of conv?.messages ?? []) { const t = toMs(m?.sent_date); if (!t) continue; events.push({ ts: t, source: 'tinder', kind: 'message', title: String(conv.match_id ?? ''), value: String(m.message ?? '').length, file: p, meta: { direction: 'sent', type: m.type ?? 'text' } }); }
      }
      if (matches) claims.push({ source: 'tinder', field: 'conversations_count', value: String(matches), file: p });
      if (j.Purchases) { const sub = j.Purchases.subscription ?? []; for (const s of Array.isArray(sub) ? sub : []) { const t = toMs(s?.create_date); if (t) events.push({ ts: t, source: 'tinder', kind: 'purchase', title: String(s.product_type ?? 'subscription'), file: p }); } }
    }
    if (!files.length) warnings.push('Tinder: no data.json with Usage/User/Messages found.');
    onProgress?.(`Tinder: ${events.length} events, ${claims.length} claims`);
    return { source: 'tinder', events, claims, files, warnings } satisfies ParseResult;
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Hinge: matches.json (+ user.json, prompts.json, media.json)                                 */
/* ------------------------------------------------------------------------------------------ */

/**
 * Hinge data export: matches.json is an array of interactions, each with optional
 * match[] / like[] / chats[] / block[] / we_met[] lists carrying timestamps.
 */
export const hinge: Parser = {
  source: 'hinge',
  // matches.json is the one file every Hinge export has (user.json/prompts.json/media.json ride along); a lone matches.json is enough.
  detect: (paths) => paths.some((p) => /hinge/.test(p)) || paths.some((p) => /(^|\/)matches\.json$/.test(p) && !/tinder|bumble/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    for (const p of byName(paths, /(^|\/)matches\.json$/)) {
      const j = safeJson<any>(await a.text(p)); if (!Array.isArray(j)) continue; files.push(p);
      let matched = 0, liked = 0, blocked = 0, met = 0;
      j.forEach((it: any, idx: number) => {
        if (!it || typeof it !== 'object') return;
        const id = String(idx);
        for (const m of it.match ?? []) { const t = toMs(m?.timestamp); if (t) { matched++; events.push({ ts: t, source: 'hinge', kind: 'match', title: id, file: p }); } }
        for (const l of it.like ?? []) { const t = toMs(l?.timestamp); if (t) { liked++; events.push({ ts: t, source: 'hinge', kind: 'swipe', title: id, file: p, meta: { direction: 'like', comment: !!(l.comment || l.like?.[0]?.comment) } }); } }
        for (const c of it.chats ?? []) { const t = toMs(c?.timestamp); if (t) events.push({ ts: t, source: 'hinge', kind: 'message', title: id, value: String(c.body ?? '').length, file: p, meta: { direction: 'sent' } }); }
        for (const b of it.block ?? []) { const t = toMs(b?.timestamp); if (t) { blocked++; events.push({ ts: t, source: 'hinge', kind: 'other', title: id, file: p, meta: { what: 'block', type: b.block_type ?? '' } }); } }
        for (const w of it.we_met ?? []) { const t = toMs(w?.timestamp); if (t) { met++; events.push({ ts: t, source: 'hinge', kind: 'other', title: id, file: p, meta: { what: 'we_met', did_meet: w.did_meet_subject ?? '' } }); } }
      });
      claims.push({ source: 'hinge', field: 'matches_count', value: String(matched), file: p });
      claims.push({ source: 'hinge', field: 'likes_sent_count', value: String(liked), file: p });
      if (blocked) claims.push({ source: 'hinge', field: 'unmatched_count', value: String(blocked), file: p });
      if (met) claims.push({ source: 'hinge', field: 'we_met_count', value: String(met), file: p });
    }
    for (const p of byName(paths, /(^|\/)user\.json$/).filter((q) => /hinge/.test(q) || files.length)) {
      const j = safeJson<any>(await a.text(p)); if (!j || typeof j !== 'object') continue; files.push(p);
      const prof = j.profile ?? j; const acc = j.account ?? {};
      const yr = String(prof.birth_date ?? prof.birthday ?? '').match(/\d{4}/); if (yr) claims.push({ source: 'hinge', field: 'declared_birth_year', value: yr[0], file: p });
      for (const k of ['gender', 'gender_identity', 'ethnicities', 'religions', 'education_attained', 'politics', 'height_centimeters', 'job_title', 'workplaces', 'hometowns', 'drinking', 'smoking', 'marijuana', 'drugs', 'children', 'family_plans', 'relationship_types', 'dating_intention'] as const) {
        const v = prof[k]; if (v == null || v === '') continue; claims.push({ source: 'hinge', field: 'declared_' + k, value: Array.isArray(v) ? v.join(', ') : String(v), file: p });
      }
      const pref = j.preferences ?? {}; if (pref.age_min != null && pref.age_max != null) claims.push({ source: 'hinge', field: 'age_filter', value: `${pref.age_min}-${pref.age_max}`, file: p });
      if (acc.phone_number) claims.push({ source: 'hinge', field: 'declared_phone', value: mask(String(acc.phone_number)), file: p });
      if (acc.email ?? j.email) claims.push({ source: 'hinge', field: 'declared_email', value: mask(String(acc.email ?? j.email)), file: p });
      if (acc.signup_time) claims.push({ source: 'hinge', field: 'account_created', value: String(acc.signup_time), file: p });
      for (const d of j.devices ?? []) { const v = d?.device_model ?? d?.device_platform; if (v) claims.push({ source: 'hinge', field: 'device', value: String(v), file: p, meta: { ip: maskIp(String(d.ip_address ?? '')) } }); }
      const loc = j.location ?? prof.location; if (loc && (loc.latitude != null || loc.lat != null)) claims.push({ source: 'hinge', field: 'last_location', value: `${Number(loc.latitude ?? loc.lat).toFixed(2)},${Number(loc.longitude ?? loc.lon ?? loc.lng).toFixed(2)}`, file: p });
    }
    if (!files.length) warnings.push('Hinge: no matches.json found.');
    onProgress?.(`Hinge: ${events.length} events, ${claims.length} claims`);
    return { source: 'hinge', events, claims, files, warnings } satisfies ParseResult;
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Bumble: format varies (CSV or JSON); best-effort by key names                              */
/* ------------------------------------------------------------------------------------------ */

export const bumble: Parser = {
  source: 'bumble',
  detect: (paths) => paths.some((p) => /bumble/.test(p) && /\.(json|csv)$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = byName(a.list(), /bumble.*\.(json|csv)$/);
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const row = (r: Record<string, any>, hint: string, p: string) => {
      const keys = Object.keys(r); const lk = keys.map((k) => k.toLowerCase());
      const pick = (re: RegExp) => { const i = lk.findIndex((k) => re.test(k)); return i >= 0 ? r[keys[i]] : undefined; };
      const t = toMs(pick(/^(date|time|timestamp|created|sent|date_?time|datetime|created_at|sent_at|match(ed)?_?(at|date|time))$/) ?? pick(/date|time/)); if (!t) return;
      const text = `${hint} ${lk.join(' ')}`;
      const kind: Kind = /message|chat/.test(text) ? 'message' : /match/.test(text) ? 'match' : /vote|swipe|like|pass/.test(text) ? 'swipe' : /session|login|open/.test(text) ? 'session' : 'other';
      const body = pick(/^(message|text|body|content)$/);
      const dir = pick(/direction|vote|type|action/);
      events.push({ ts: t, source: 'bumble', kind, actor: str(pick(/^(name|user|sender|from|match_?name)$/)), value: body != null ? String(body).length : undefined, file: p, meta: { hint, direction: dir != null ? String(dir) : undefined } });
    };
    for (const p of paths) {
      const txt = await a.text(p); const hint = p.slice(p.lastIndexOf('/') + 1).replace(/\.(json|csv)$/, '');
      if (p.endsWith('.csv')) { const rows = parseCsv(txt); if (!rows.length) continue; files.push(p); for (const r of rows) row(r, hint, p); continue; }
      const j = safeJson<any>(txt); if (!j) continue; files.push(p);
      walk(j, [], (key, list) => { for (const it of list) if (it && typeof it === 'object' && !Array.isArray(it)) row(it, `${hint} ${key}`, p); }, (key, map) => {
        if (/profile|user|account|personal/i.test(key) || /profile|user|account/i.test(hint)) {
          for (const [k, v] of Object.entries(map)) {
            if (v == null || typeof v === 'object') continue; const kl = k.toLowerCase();
            if (/birth|dob/.test(kl)) { const y = String(v).match(/\d{4}/); if (y) claims.push({ source: 'bumble', field: 'declared_birth_year', value: y[0], file: p }); }
            else if (/^gender$|^sex$/.test(kl)) claims.push({ source: 'bumble', field: 'declared_gender', value: String(v), file: p });
            else if (/interested|looking|show_?me|seeking/.test(kl)) claims.push({ source: 'bumble', field: 'interested_in', value: String(v), file: p });
            else if (/city|location|hometown/.test(kl)) claims.push({ source: 'bumble', field: 'declared_city', value: String(v), file: p });
            else if (/email/.test(kl)) claims.push({ source: 'bumble', field: 'declared_email', value: mask(String(v)), file: p });
            else if (/phone/.test(kl)) claims.push({ source: 'bumble', field: 'declared_phone', value: mask(String(v)), file: p });
            else if (/^(name|first_?name)$/.test(kl)) claims.push({ source: 'bumble', field: 'declared_name', value: String(v), file: p });
            else if (/job|work|occupation/.test(kl)) claims.push({ source: 'bumble', field: 'declared_job', value: String(v), file: p });
            else if (/education|school|university/.test(kl)) claims.push({ source: 'bumble', field: 'declared_school', value: String(v), file: p });
          }
        }
      });
    }
    if (!events.length && !claims.length) warnings.push('Bumble: archive recognized but no timestamped rows found (format is best-effort).');
    onProgress?.(`Bumble: ${events.length} events, ${claims.length} claims`);
    return { source: 'bumble', events, claims, files, warnings } satisfies ParseResult;
  },
};

/* ------------------------------------------------------------------------------------------ */

function gender(v: unknown): string { const s = String(v); return ({ '0': 'male', '1': 'female', M: 'male', F: 'female', m: 'male', f: 'female' } as Record<string, string>)[s] ?? s; }
function str(v: unknown): string | undefined { return v == null ? undefined : String(v); }
function walk(node: any, path: string[], onList: (key: string, list: any[], path: string[]) => void, onMap: (key: string, map: any, path: string[]) => void, depth = 0) {
  if (depth > 6 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) { onList('', node, path); return; }
  for (const [k, v] of Object.entries(node)) {
    if (Array.isArray(v)) onList(k, v, [...path, k]);
    else if (v && typeof v === 'object') { onMap(k, v, [...path, k]); walk(v, [...path, k], onList, onMap, depth + 1); }
  }
}
function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }
function maskIp(s: string) { if (!s) return ''; const v4 = s.split('.'); if (v4.length === 4) return `${v4[0]}.${v4[1]}.•.•`; const v6 = s.split(':'); return v6.length > 2 ? v6.slice(0, 2).join(':') + ':••' : '••'; }
