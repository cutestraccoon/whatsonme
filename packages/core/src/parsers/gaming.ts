import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, parseCsv, safeJson, toMs } from '../util/text.js';

/* ------------------------------------------------------------------------------------------ */
/* Steam                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * Steam "Request your Steam account data" (GDPR). Folder/file names vary by year; we match
 * loosely: anything named "playtime" / "gameplay" (CSV or JSON) for games, "account history" /
 * "login" for sign-ins. Playtime is minutes; we store ms.
 */
export const steam: Parser = {
  source: 'steam',
  detect: (paths) => paths.some((p) => /steam/.test(p) && /\.(json|csv)$/.test(p)) || paths.some((p) => /(^|\/)(playtime|gameplayhistory|gameplay_history|owned_games)[^/]*\.(json|csv)$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = byName(a.list(), /\.(json|csv)$/).filter((p) => /steam/.test(p) || /(^|\/)(playtime|gameplayhistory|gameplay_history|owned_games|accounthistory|account_history|logins?)[^/]*\.(json|csv)$/.test(p));
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const rows = async (p: string): Promise<Record<string, any>[]> => {
      const txt = await a.text(p);
      if (p.endsWith('.csv')) return parseCsv(txt);
      const j = safeJson<any>(txt); if (!j) return [];
      if (Array.isArray(j)) return j;
      const arr = Object.values(j).find(Array.isArray) as any[] | undefined;
      if (arr) return arr;
      const nested = j.response?.games ?? j.games ?? j.data;
      return Array.isArray(nested) ? nested : [];
    };
    const pick = (r: Record<string, any>, re: RegExp) => { const k = Object.keys(r).find((k) => re.test(k.toLowerCase())); return k ? r[k] : undefined; };

    for (const p of paths.filter((q) => /playtime|gameplay|owned_games|games/.test(q) && !/achievement/.test(q))) {
      const rs = await rows(p); if (!rs.length) continue; files.push(p);
      let totalMin = 0; let n = 0;
      for (const r of rs) {
        if (!r || typeof r !== 'object') continue;
        const name = pick(r, /^(name|game|game_?name|title|app_?name)$/); const appid = pick(r, /^app_?id$/);
        const mins = Number(pick(r, /playtime_?forever|total_?playtime|playtime(_minutes)?$|minutes/)) || 0;
        const last = toMs(pick(r, /last_?played|last_?play|rtime_last_played|last_?launch/));
        n++; totalMin += mins;
        if (!last) continue;
        events.push({ ts: last, source: 'steam', kind: 'play', title: name != null ? String(name) : undefined, value: mins * 60000, file: p, meta: { appid: appid != null ? String(appid) : undefined, two_weeks_min: Number(pick(r, /playtime_?2weeks|recent/)) || undefined, platform: str(pick(r, /platform|os/)) } });
      }
      claims.push({ source: 'steam', field: 'games_count', value: String(n), file: p });
      if (totalMin) claims.push({ source: 'steam', field: 'total_playtime_hours', value: String(Math.round(totalMin / 60)), file: p });
    }
    for (const p of paths.filter((q) => /account.?history|login/.test(q))) {
      const rs = await rows(p); if (!rs.length) continue; files.push(p);
      for (const r of rs) {
        if (!r || typeof r !== 'object') continue;
        const t = toMs(pick(r, /^(time|timestamp|date|login_?time|created|time_?stamp|logintime)$/) ?? pick(r, /time|date/)); if (!t) continue;
        const ip = pick(r, /ip/); const dev = pick(r, /device|os|platform|client|user_?agent/); const country = pick(r, /country|location|city/);
        const action = pick(r, /^(action|event|type|description)$/);
        const isLogin = action == null || /login|log in|sign/i.test(String(action));
        events.push({ ts: t, source: 'steam', kind: isLogin ? 'login' : 'other', title: dev != null ? String(dev) : undefined, file: p, meta: { ip: maskIp(str(ip) ?? ''), country: str(country), action: str(action) } });
      }
    }
    for (const p of paths.filter((q) => /account.?info|profile|user_?data|personal/.test(q) && !/history/.test(q))) {
      const j = safeJson<any>(await a.text(p)); if (!j || typeof j !== 'object' || Array.isArray(j)) continue; files.push(p);
      for (const [k, v] of Object.entries(j)) { if (v == null || typeof v === 'object') continue; const kl = k.toLowerCase();
        if (/persona|account_?name|username/.test(kl)) claims.push({ source: 'steam', field: 'declared_username', value: String(v), file: p });
        else if (/email/.test(kl)) claims.push({ source: 'steam', field: 'declared_email', value: mask(String(v)), file: p });
        else if (/country/.test(kl)) claims.push({ source: 'steam', field: 'declared_country', value: String(v), file: p });
        else if (/steam_?id/.test(kl)) claims.push({ source: 'steam', field: 'steam_id', value: String(v), file: p });
        else if (/created|time_?created/.test(kl)) claims.push({ source: 'steam', field: 'account_created', value: String(v), file: p }); }
    }
    if (!events.length && !claims.length) warnings.push('Steam: archive recognized but no playtime/login files parsed.');
    onProgress?.(`Steam: ${events.length} events, ${claims.length} claims`);
    return { source: 'steam', events, claims, files, warnings } satisfies ParseResult;
  },
};

/* ------------------------------------------------------------------------------------------ */
/* Discord                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const MAX_OTHER = 4000;

/**
 * Discord "Request all of my data" package: messages/index.json + messages/c<id>/messages.json
 * (or .csv in older packages), activity/analytics/events-*.json (newline-delimited), account/user.json.
 * Message text is never stored, only length.
 */
export const discord: Parser = {
  source: 'discord',
  detect: (paths) => paths.some((p) => /(^|\/)messages\/index\.json$/.test(p) || /(^|\/)activity\/(analytics|reporting|modeling|tns)\/events-[^/]+\.json$/.test(p) || /(^|\/)account\/user\.json$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];

    // channel names
    const index: Record<string, string> = {};
    for (const p of byName(paths, /(^|\/)messages\/index\.json$/)) { files.push(p); const j = safeJson<Record<string, string | null>>(await a.text(p)); for (const [k, v] of Object.entries(j ?? {})) index[k] = v ?? ''; }
    const chanMeta: Record<string, { name: string; guild: string; type: string | number }> = {};
    for (const p of byName(paths, /(^|\/)messages\/c?\d+\/channel\.json$/)) { const j = safeJson<any>(await a.text(p)); if (!j) continue; const id = String(j.id ?? p.match(/\/c?(\d+)\/channel\.json$/)?.[1] ?? ''); chanMeta[id] = { name: j.name ?? '', guild: j.guild?.name ?? '', type: j.type ?? '' }; }

    // messages
    let dmCount = 0, guildCount = 0; const channelsUsed = new Set<string>();
    for (const p of byName(paths, /(^|\/)messages\/c?\d+\/messages\.(json|csv)$/)) {
      const id = p.match(/\/c?(\d+)\/messages\.(json|csv)$/)?.[1] ?? '';
      const label = index[id] ?? ''; const cm = chanMeta[id];
      const isDm = /^direct message with /i.test(label) || cm?.type === 1 || cm?.type === 3;
      const title = cm?.guild ? `${cm.guild} / ${cm.name || label}` : (isDm ? 'DM' : label || cm?.name || id);
      const txt = await a.text(p);
      const rs: any[] = p.endsWith('.csv') ? parseCsv(txt) : (safeJson<any[]>(txt) ?? []);
      if (!Array.isArray(rs)) continue; files.push(p); channelsUsed.add(id);
      for (const m of rs) {
        const t = normTs(m?.Timestamp ?? m?.timestamp); if (!t) continue;
        const att = m.Attachments ?? m.attachments ?? '';
        events.push({ ts: t, source: 'discord', kind: 'message', title, value: String(m.Contents ?? m.contents ?? '').length, file: p, meta: { channel: isDm ? 'dm' : 'guild', guild: cm?.guild || undefined, attachments: typeof att === 'string' ? (att ? att.split(/\s+/).filter(Boolean).length : 0) : Array.isArray(att) ? att.length : 0 } });
        if (isDm) dmCount++; else guildCount++;
      }
    }
    if (channelsUsed.size) {
      const f = files.find((q) => /messages\/index\.json$/.test(q)) ?? files[0];
      claims.push({ source: 'discord', field: 'channels_messaged', value: String(channelsUsed.size), file: f, meta: { dm_messages: dmCount, guild_messages: guildCount } });
    }

    // analytics: newline-delimited JSON, can be enormous
    let otherSeen = 0; let otherKept = 0;
    const seen = { os: new Set<string>(), city: new Set<string>(), country: new Set<string>(), browser: new Set<string>() };
    const analytics = byName(paths, /(^|\/)activity\/(analytics|reporting|modeling|tns)\/events-[^/]+\.json$/);
    // first pass count for sampling rate
    let totalLines = 0; const texts: Record<string, string> = {};
    for (const p of analytics) { texts[p] = await a.text(p); totalLines += (texts[p].match(/\n/g)?.length ?? 0) + 1; }
    const stride = Math.max(1, Math.ceil(totalLines / MAX_OTHER));
    for (const p of analytics) {
      files.push(p);
      for (const line of texts[p].split('\n')) {
        if (!line.trim()) continue; const e = safeJson<any>(line); if (!e) continue;
        const t = normTs(e.timestamp ?? e.client_send_timestamp ?? e.day_pt ?? e.time); if (!t) continue;
        const type = String(e.event_type ?? e.type ?? 'unknown');
        // Discord's own inferences about the user ride along in analytics rows (seen in real packages via purarue/discord_data).
        if (e.predicted_gender != null && !claims.some((c) => c.field === 'inferred_gender')) claims.push({ source: 'discord', field: 'inferred_gender', value: String(e.predicted_gender), file: p });
        if (e.predicted_age != null && !claims.some((c) => c.field === 'inferred_age')) claims.push({ source: 'discord', field: 'inferred_age', value: String(e.predicted_age), file: p });
        if (e.os) seen.os.add(String(e.os)); if (e.city) seen.city.add(String(e.city)); if (e.country_code ?? e.country) seen.country.add(String(e.country_code ?? e.country)); if (e.browser) seen.browser.add(String(e.browser));
        if (/^(app_opened|session_start|launch_game|app_crashed|login_successful|ready_payload_received)$/.test(type)) {
          events.push({ ts: t, source: 'discord', kind: type === 'launch_game' ? 'play' : type === 'login_successful' ? 'login' : 'session', title: type === 'launch_game' ? str(e.game) : type, file: p, meta: { os: str(e.os), city: str(e.city), country: str(e.country_code ?? e.country), ip: maskIp(str(e.ip) ?? '') } });
        } else {
          otherSeen++;
          if (otherSeen % stride === 0 && otherKept < MAX_OTHER) { otherKept++; events.push({ ts: t, source: 'discord', kind: 'other', title: type, file: p, meta: { sampled: stride, os: str(e.os) } }); }
        }
      }
    }
    if (analytics.length) {
      const f = analytics[0];
      for (const v of seen.os) claims.push({ source: 'discord', field: 'device_os', value: v, file: f });
      for (const v of [...seen.city].slice(0, 50)) claims.push({ source: 'discord', field: 'location_history', value: v, file: f });
      for (const v of seen.country) claims.push({ source: 'discord', field: 'country', value: v, file: f });
      for (const v of seen.browser) claims.push({ source: 'discord', field: 'browser', value: v, file: f });
      claims.push({ source: 'discord', field: 'analytics_events_count', value: String(otherSeen + events.filter((e) => e.source === 'discord' && e.kind !== 'message' && e.kind !== 'other').length), file: f });
    }
    // account
    for (const p of byName(paths, /(^|\/)account\/user\.json$/)) {
      files.push(p); const j = safeJson<any>(await a.text(p)); if (!j) continue;
      if (j.username) claims.push({ source: 'discord', field: 'declared_username', value: j.discriminator && j.discriminator !== '0' ? `${j.username}#${j.discriminator}` : String(j.username), file: p });
      if (j.global_name) claims.push({ source: 'discord', field: 'declared_name', value: String(j.global_name), file: p });
      if (j.email) claims.push({ source: 'discord', field: 'declared_email', value: mask(String(j.email)), file: p });
      if (j.phone) claims.push({ source: 'discord', field: 'declared_phone', value: mask(String(j.phone)), file: p });
      if (j.ip) claims.push({ source: 'discord', field: 'last_ip', value: maskIp(String(j.ip)), file: p });
      if (Array.isArray(j.connections)) for (const c of j.connections) if (c?.type) claims.push({ source: 'discord', field: 'connected_account', value: String(c.type), file: p, meta: { name: c.name ?? '' } });
      if (Array.isArray(j.relationships)) claims.push({ source: 'discord', field: 'friends_count', value: String(j.relationships.filter((r: any) => r?.type === 1).length), file: p });
      if (Array.isArray(j.payments)) for (const pay of j.payments) { const t = normTs(pay?.created_at); if (t) events.push({ ts: t, source: 'discord', kind: 'purchase', title: str(pay.description), value: Number(pay.amount) / 100 || undefined, file: p, meta: { currency: str(pay.currency) } }); }
      if (j.flags != null) claims.push({ source: 'discord', field: 'account_flags', value: String(j.flags), file: p });
    }
    for (const p of byName(paths, /(^|\/)servers\/index\.json$/)) { files.push(p); const j = safeJson<Record<string, string>>(await a.text(p)); if (j) claims.push({ source: 'discord', field: 'servers_count', value: String(Object.keys(j).length), file: p }); }

    if (!events.length && !claims.length) warnings.push('Discord: package recognized but no messages/analytics/account files parsed.');
    onProgress?.(`Discord: ${events.length} events, ${claims.length} claims`);
    return { source: 'discord', events, claims, files, warnings } satisfies ParseResult;
  },
};

/* ------------------------------------------------------------------------------------------ */

/** Discord: "2024-03-12 10:21:33.123000+00:00" or "... UTC" or ISO */
function normTs(v: unknown): number | null { if (typeof v === 'string') return toMs(v.trim().replace(/\s*UTC$/i, 'Z')); return toMs(v); }
function str(v: unknown): string | undefined { return v == null || v === '' ? undefined : String(v); }
function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }
function maskIp(s: string) { if (!s) return ''; const v4 = s.split('.'); if (v4.length === 4) return `${v4[0]}.${v4[1]}.•.•`; const v6 = s.split(':'); return v6.length > 2 ? v6.slice(0, 2).join(':') + ':••' : '••'; }
