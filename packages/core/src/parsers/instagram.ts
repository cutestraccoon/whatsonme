import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { basename, byName, fixMojibake, safeJson, toMs } from '../util/text.js';
import { parseInstagramHtml } from './instagram-html.js';

/**
 * Instagram "Download your information" (JSON). Paths changed across years, so we
 * match by file name, not folder. Timestamps are unix seconds.
 */
export const instagram: Parser = {
  source: 'instagram',
  detect: (paths) =>
    (paths.some((p) => /(^|\/)(liked_posts|videos_watched|posts_viewed|your_topics|advertisers_using_your_activity_or_information|personal_information|synced_contacts|login_activity)\.(json|html)$/.test(p)) || paths.some((p) => /(^|\/)start_here\.html$/.test(p) && paths.some((q) => /your_instagram_activity|apps_and_websites_off_of_instagram|ads_information/.test(q)))),
  // Facebook exports share Meta's shapes; parsing them here is better than refusing them.
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const fx = fixMojibake;
    const read = async (p: string) => { files.push(p); return safeJson<any>(await a.text(p)); };
    let myName = ''; for (const p of byName(paths, /personal_information\.json$/)) { const j = safeJson<any>(await a.text(p)); const smd = j?.profile_user?.[0]?.string_map_data ?? {}; myName = fx(smd.Name?.value ?? smd.Username?.value ?? ''); }
    // string_map_data keys are localized into the account's language (a real Dutch export has "Tijd", "IP-adres", "Gebruikersnaam"), so look keys up by regex.
    const tsOf = (o: any) => toMs(o?.timestamp ?? o?.Time?.timestamp ?? kv(o?.string_map_data, L.time)?.timestamp ?? anyTs(o?.string_map_data));
    const val = (smd: any, re: RegExp): string | undefined => { const v = kv(smd, re)?.value; return v == null || v === '' ? undefined : String(v); };

    // likes
    for (const p of byName(paths, /liked_posts\.json$/)) {
      const j = await read(p); for (const it of j?.likes_media_likes ?? [])
        for (const s of it.string_list_data ?? []) { const t = toMs(s.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'like', actor: fx(it.title ?? ''), url: s.href, file: p }); }
    }
    for (const p of byName(paths, /liked_comments\.json$/)) {
      const j = await read(p); for (const it of j?.likes_comment_likes ?? []) for (const s of it.string_list_data ?? []) { const t = toMs(s.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'like', actor: fx(it.title ?? ''), url: s.href, file: p, meta: { what: 'comment' } }); }
    }
    // saved
    for (const p of byName(paths, /saved_posts\.json$/)) {
      const j = await read(p); for (const it of j?.saved_saved_media ?? []) { const d = it.string_map_data?.['Saved on']; const t = toMs(d?.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'save', actor: fx(it.title ?? ''), url: d?.href, file: p }); }
    }
    // impressions: videos watched, posts viewed, ads viewed, suggested accounts viewed
    const imp: [RegExp, string, Event['kind'], Record<string, string>?][] = [
      [/videos_watched\.json$/, 'impressions_history_videos_watched', 'watch', { what: 'video' }],
      [/posts_viewed\.json$/, 'impressions_history_posts_seen', 'watch', { what: 'post' }],
      [/ads_viewed\.json$/, 'impressions_history_ads_seen', 'ad_view'],
      [/ads_clicked\.json$/, 'impressions_history_ads_clicked', 'ad_click'],
      [/suggested_accounts_viewed\.json$/, 'impressions_history_chaining_seen', 'watch', { what: 'suggested_account' }],
    ];
    for (const [re, key, kind, meta] of imp) for (const p of byName(paths, re)) {
      const j = await read(p); const arr = j?.[key] ?? Object.values(j ?? {}).find(Array.isArray) ?? [];
      for (const it of arr) { const smd = it.string_map_data ?? {}; const t = tsOf(it); if (!t) continue;
        events.push({ ts: t, source: 'instagram', kind, actor: fx(smd.Author?.value ?? smd.Username?.value ?? ''), title: fx(smd.Title?.value ?? ''), file: p, meta }); }
    }
    // searches
    for (const p of byName(paths, /(account_searches|word_or_phrase_searches|profile_searches|searches)\.json$/)) {
      const j = await read(p); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] ?? [];
      for (const it of arr) { const smd = it.string_map_data ?? {};
        // profile_searches.json (2025+): { title: "<username>", string_list_data: [{ href, timestamp }] }
        const t = tsOf(it) ?? toMs(it.string_list_data?.[0]?.timestamp); const q = val(smd, L.search) ?? val(smd, L.username) ?? (it.string_list_data ? it.title : undefined); if (t && q) events.push({ ts: t, source: 'instagram', kind: 'search', title: fx(q), file: p, meta: { what: /profile|account/.test(p) ? 'account' : 'keyword' } }); }
    }
    // posts, stories, comments
    for (const p of byName(paths, /(^|\/)posts_\d+\.json$/)) { const j = await read(p); for (const post of (Array.isArray(j) ? j : j?.ig_posts ?? [])) { const t = toMs(post.creation_timestamp ?? post.media?.[0]?.creation_timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'post', title: fx(post.title ?? post.media?.[0]?.title ?? ''), file: p }); } }
    for (const p of byName(paths, /stories\.json$/)) { const j = await read(p); for (const s of j?.ig_stories ?? []) { const t = toMs(s.creation_timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'post', title: 'story', file: p }); } }
    for (const p of byName(paths, /(post_comments_\d+|reels_comments)\.json$/)) { const j = await read(p); const arr = Array.isArray(j) ? j : (Object.values(j ?? {}).find(Array.isArray) as any[] ?? []); for (const c of arr) { const smd = c.string_map_data ?? {}; const t = tsOf(c); if (t) events.push({ ts: t, source: 'instagram', kind: 'comment', title: fx(val(smd, L.comment) ?? ''), actor: fx(val(smd, L.mediaOwner) ?? ''), file: p }); } }
    // messages
    for (const p of byName(paths, /\/messages\/(inbox|message_requests)\/[^/]+\/message_\d+\.json$/)) {
      const j = await read(p); const thread = fx(j?.title ?? basename(p)); const me = j?.participants?.length;
      for (const m of j?.messages ?? []) { const t = toMs(m.timestamp_ms); if (!t) continue; const sender = fx(m.sender_name ?? ''); events.push({ ts: t, source: 'instagram', kind: 'message', actor: sender, title: thread, value: (m.content ?? '').length, file: p, meta: { participants: me ?? 0, from_me: !!myName && sender === myName, media: !!(m.photos || m.videos || m.audio_files || m.share) } }); }
    }
    // logins
    for (const p of byName(paths, /login_activity\.json$/)) {
      const j = await read(p); for (const it of j?.account_history_login_history ?? []) { const smd = it.string_map_data ?? {}; const t = tsOf(it) ?? toMs(it.title); if (t) events.push({ ts: t, source: 'instagram', kind: 'login', title: fx(val(smd, L.userAgent) ?? ''), file: p, meta: { ip: maskIp(val(smd, L.ip) ?? ''), cookie: val(smd, L.cookie) ?? '' } }); }
    }
    for (const p of byName(paths, /devices\.json$/)) { const j = await read(p); for (const it of j?.devices_devices ?? []) { const smd = it.string_map_data ?? {}; claims.push({ source: 'instagram', field: 'device', value: fx(smd['User Agent']?.value ?? smd['Device ID']?.value ?? ''), file: p, meta: { last_login: toMs(smd['Last Login']?.timestamp) ?? undefined } }); } }
    // off-Meta activity
    for (const p of byName(paths, /your_activity_off_meta_technolog(y|ies)\.json$/)) {
      const j = await read(p); for (const app of j?.apps_and_websites_off_meta_activity ?? []) { const name = fx(app.name ?? ''); for (const e of app.events ?? []) { const t = toMs(e.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'off_platform', actor: name, title: e.type ?? '', file: p }); } }
    }
    // advertisers using your activity
    for (const p of byName(paths, /advertisers_using_your_activity_or_information\.json$/)) {
      const j = await read(p); for (const ad of j?.ig_custom_audiences_all_types ?? []) claims.push({ source: 'instagram', field: 'advertiser_audience', value: fx(ad.advertiser_name ?? ''), file: p,
        meta: { uploaded_list: !!ad.has_data_file_custom_audience, remarketing: !!ad.has_remarketing_custom_audience, in_store: !!ad.has_in_person_store_visit } });
    }
    // ad interests + topics (the algorithm's model of you)
    for (const p of byName(paths, /ads_interests\.json$/)) { const j = await read(p); for (const it of j?.inferred_data_ig_interest ?? j?.topics_your_topics ?? []) { const v = it.string_map_data?.Interest?.value ?? it.string_map_data?.Name?.value; if (v) claims.push({ source: 'instagram', field: 'ad_interest', value: fx(v), file: p }); } }
    for (const p of byName(paths, /your_topics\.json$/)) { const j = await read(p); for (const it of j?.topics_your_topics ?? []) { const v = it.string_map_data?.Name?.value; if (v) claims.push({ source: 'instagram', field: 'topic', value: fx(v), file: p }); } }
    // information about you (inferred)
    for (const p of byName(paths, /profile_based_in\.json$/)) { const j = await read(p); for (const it of j?.inferred_data_primary_location ?? []) { const v = val(it.string_map_data, L.city) ?? anyVal(it.string_map_data); if (v) claims.push({ source: 'instagram', field: 'profile_based_in', value: fx(v), file: p }); } }
    for (const p of byName(paths, /locations_of_interest\.json$/)) { const j = await read(p); for (const it of j?.label_values ?? []) for (const v of it.vec ?? []) if (v.value) claims.push({ source: 'instagram', field: 'location_of_interest', value: fx(v.value), file: p }); }
    for (const p of byName(paths, /possible_phone_numbers\.json$/)) { const j = await read(p); for (const it of j?.inferred_data_inferred_phone_numbers ?? []) { const v = it.string_list_data?.[0]?.value; if (v) claims.push({ source: 'instagram', field: 'possible_phone_number', value: String(v).replace(/\d(?=\d{2})/g, '•'), file: p }); } }
    for (const p of byName(paths, /personal_information\.json$/)) { const j = await read(p); const smd = j?.profile_user?.[0]?.string_map_data ?? {}; const fields: [string, RegExp, boolean][] = [['username', L.username, false], ['name', L.name, false], ['gender', L.gender, false], ['date_of_birth', L.dob, false], ['email', L.email, true], ['phone_number', L.phone, true]]; for (const [k, re, sensitive] of fields) { const v = val(smd, re); if (v) claims.push({ source: 'instagram', field: 'declared_' + k, value: sensitive ? mask(fx(v)) : fx(v), file: p }); } }
    // followers / following counts  (followers_1.json is an array of entries, or — for a single follower — one bare entry object)
    for (const p of byName(paths, /followers_\d+\.json$/)) { const j = await read(p); const arr = Array.isArray(j) ? j : Array.isArray(j?.relationships_followers) ? j.relationships_followers : Array.isArray(j?.string_list_data) ? [j] : []; claims.push({ source: 'instagram', field: 'followers_count', value: String(arr.length), file: p }); }
    for (const p of byName(paths, /following\.json$/)) { const j = await read(p); claims.push({ source: 'instagram', field: 'following_count', value: String((j?.relationships_following ?? []).length), file: p }); }
    // in-app browser history (link_history.json)
    for (const p of byName(paths, /link_history\.json$/)) { const j = await read(p); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] ?? []; for (const it of arr) { const smd = it.string_map_data ?? {}; const t = toMs(smd['Timestamp']?.timestamp ?? smd.Time?.timestamp ?? smd['Website visited time']?.timestamp); const url = smd['Website URL']?.value ?? smd.URL?.value ?? smd.Url?.value ?? it.string_list_data?.[0]?.href; if (t && url) events.push({ ts: t, source: 'instagram', kind: 'visit', title: fx(smd['Website title']?.value ?? smd.Title?.value ?? ''), url: String(url).split('?')[0], file: p, meta: { via: 'in-app-browser' } }); } }
    // story interactions
    const story: [RegExp, string][] = [[/story_likes\.json$/, 'story_like'], [/polls\.json$/, 'poll'], [/quizzes\.json$/, 'quiz'], [/emoji_sliders\.json$/, 'emoji_slider'], [/questions\.json$/, 'question'], [/countdowns\.json$/, 'countdown'], [/story_reaction_sticker_reactions\.json$/, 'reaction']];
    for (const [re, what] of story) for (const p of byName(paths, re)) { const j = await read(p); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] ?? []; for (const it of arr) { const t = toMs(it.string_list_data?.[0]?.timestamp ?? it.string_map_data?.Time?.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'other', actor: fx(it.title ?? ''), title: what, file: p, meta: { what: 'story_' + what } }); } }
    // shopping
    for (const p of byName(paths, /recently_viewed_items\.json$/)) { const j = await read(p); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] ?? []; for (const it of arr) { const smd = it.string_map_data ?? {}; const t = toMs(smd.Time?.timestamp ?? smd['Last viewed']?.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'visit', title: fx(smd['Product Name']?.value ?? smd.Name?.value ?? 'product'), actor: fx(smd['Merchant Name']?.value ?? ''), file: p, meta: { what: 'product' } }); } }
    // recommended topics, privacy changes, signup, last known location, autofill
    for (const p of byName(paths, /recommended_topics\.json$/)) { const j = await read(p); for (const it of j?.topics_your_topics ?? j?.topics_recommended_topics ?? (Object.values(j ?? {}).find(Array.isArray) as any[] ?? [])) { const v = it.string_map_data?.Name?.value; if (v) claims.push({ source: 'instagram', field: 'recommended_topic', value: fx(v), file: p }); } }
    for (const p of byName(paths, /last_known_location\.json$/)) { const j = await read(p); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] ?? []; for (const it of arr) { const smd = it.string_map_data ?? {}; const lat = Number(smd['Imprecise Latitude']?.value ?? smd.Latitude?.value), lon = Number(smd['Imprecise Longitude']?.value ?? smd.Longitude?.value); const t = toMs(smd['Time Uploaded']?.timestamp ?? smd.Time?.timestamp); if (Number.isFinite(lat) && Number.isFinite(lon)) { claims.push({ source: 'instagram', field: 'last_known_location', value: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, file: p }); if (t) events.push({ ts: t, source: 'instagram', kind: 'location', title: 'last known location', lat, lon, file: p, meta: { semantic: 'LAST_KNOWN' } }); } } }
    for (const p of byName(paths, /autofill_information\.json$/)) { const j = await read(p); const txt = JSON.stringify(j ?? {}); const has = [/street|address/i.test(txt) && 'address', /phone/i.test(txt) && 'phone', /email/i.test(txt) && 'email', /zip|postal/i.test(txt) && 'postal code'].filter(Boolean); if (has.length) claims.push({ source: 'instagram', field: 'autofill_on_file', value: has.join(', '), file: p }); }
    for (const p of byName(paths, /signup_(information|details)\.json$/)) { const j = await read(p); const smd = (Object.values(j ?? {}).find(Array.isArray) as any[] ?? [])[0]?.string_map_data ?? {}; const t = toMs(kv(smd, L.time)?.timestamp ?? anyTs(smd)); if (t) claims.push({ source: 'instagram', field: 'account_created', value: new Date(t).toISOString().slice(0, 10), file: p }); const ip = val(smd, L.ip); if (ip) claims.push({ source: 'instagram', field: 'signup_ip', value: maskIp(ip), file: p }); }
    for (const p of byName(paths, /account_privacy_changes\.json$/)) { const j = await read(p); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] ?? []; for (const it of arr) { const t = toMs(it.string_map_data?.Time?.timestamp); if (t) events.push({ ts: t, source: 'instagram', kind: 'other', title: fx(it.title ?? 'privacy change'), file: p, meta: { what: 'privacy_change' } }); } }
    // contacts synced
    for (const p of byName(paths, /synced_contacts\.json$/)) { const j = await read(p); claims.push({ source: 'instagram', field: 'synced_contacts_count', value: String((j?.contacts_contact_info ?? []).length), file: p }); }

    if (!events.length && !claims.length) await parseInstagramHtml(a, paths, events, claims, files, warnings);
    if (!events.length && !claims.length) warnings.push('Instagram: archive recognized but no known files parsed. Please send the file list (names only) so the parser can be updated.');
    onProgress?.(`Instagram: ${events.length} events, ${claims.length} claims`);
    return { source: 'instagram', events, claims, files, warnings };
  },
};

function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }

/**
 * Localized string_map_data labels. Meta writes them in the account's UI language; these cover
 * en/nl/de/fr/es/pt/it. Unknown languages still work for timestamps (anyTs) and single-value maps (anyVal).
 */
export const L = {
  time: /^(time|tijd|zeit|uhrzeit|heure|hora|ora|tempo|czas|tid|timestamp)$/i,
  ip: /^(ip[ -]?ad(dress|res|resse)|adresse ip|direcci[oó]n ip|endere[cç]o ip|indirizzo ip|adres ip)$/i,
  userAgent: /^(user[ -]?agent|gebruikersagent|agent utilisateur|agente de usu[aá]rio|agente de usuario)$/i,
  cookie: /^(cookie[ -]?na(me|am)|nom du cookie|nombre de la cookie|nome do cookie|nome del cookie)$/i,
  username: /^(username|gebruikersnaam|benutzername|nom d.utilisateur|nombre de usuario|nome de usu[aá]rio|nome utente)$/i,
  name: /^(name|naam|nom|nombre|nome)$/i,
  gender: /^(gender|geslacht|geschlecht|genre|g[eé]nero|gênero|genere)$/i,
  dob: /^(date of birth|geboortedatum|geburtsdatum|date de naissance|fecha de nacimiento|data de nascimento|data di nascita)$/i,
  email: /^(e-?mail( address)?|e-?mailadres|e-mail-adresse|adresse e-mail|correo electr[oó]nico|endere[cç]o de e-mail|indirizzo e-mail)$/i,
  phone: /^(phone number|telefoonnummer|telefonnummer|num[eé]ro de t[eé]l[eé]phone|n[uú]mero de tel[eé]fono|n[uú]mero de telefone|numero di telefono)$/i,
  city: /^(city name|plaatsnaam|ortsname|stadtname|nom de la ville|nombre de la ciudad|nome da cidade|nome della citt[aà])$/i,
  search: /^(search|zoeken|zoekopdracht|suche|recherche|b[uú]squeda|pesquisa|ricerca)$/i,
  comment: /^(comment|opmerking|reactie|kommentar|commentaire|comentario|coment[aá]rio|commento)$/i,
  mediaOwner: /^(media owner|media-eigenaar|medieninhaber|propri[eé]taire du m[eé]dia|propietario del contenido|propriet[aá]rio da m[ií]dia|proprietario del contenuto)$/i,
};
/** First string_map_data entry whose key matches. */
export function kv(smd: any, re: RegExp): { value?: unknown; timestamp?: unknown; href?: unknown } | undefined {
  if (!smd || typeof smd !== 'object') return undefined;
  for (const k of Object.keys(smd)) if (re.test(k.trim())) return smd[k];
  return undefined;
}
/** Any non-zero timestamp in the map (labels unknown). */
export function anyTs(smd: any): number | undefined {
  if (!smd || typeof smd !== 'object') return undefined;
  for (const v of Object.values<any>(smd)) if (v && typeof v === 'object' && Number(v.timestamp) > 0) return Number(v.timestamp);
  return undefined;
}
/** The single non-empty value in a one-field map (labels unknown). */
function anyVal(smd: any): string | undefined {
  if (!smd || typeof smd !== 'object') return undefined;
  const vals = Object.values<any>(smd).map((v) => v?.value).filter((v) => v != null && v !== '');
  return vals.length === 1 ? String(vals[0]) : undefined;
}

function maskIp(ip: unknown): string { const s = String(ip ?? ''); const m = s.match(/^(\d+\.\d+)\.\d+\.\d+$/); if (m) return m[1] + '.•.•'; if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + ':••'; return s; }
