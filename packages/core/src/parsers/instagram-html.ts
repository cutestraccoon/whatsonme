import type { Archive, Claim, Event } from '../types.js';
import { basename, byName, fixMojibake, toMs } from '../util/text.js';

/**
 * Instagram "Download your information" in HTML format (the default Meta offers).
 *
 * 2025–26 layout: each record is an OUTERMOST  <div class="pam … _a6-g …">  inside <main>. Records nest further _a6-g blocks
 * (e.g. the "Owner" of a Reel), so we must not split on every _a6-g. Inside a record:
 *   key/value rows   <td class="_a6_q">Key</td><td class="_2piu _a6_r">Value</td>
 *                    <td colspan="2" class="_2pin _a6_q">Key<div><div>Value</div></div></td>
 *   timestamp        <div class="_3-94 _a6-o">Jun 17, 2026 6:01 am</div>   (or an ISO <h2> header for logins)
 *   list values      <div class="_a6-p">Alamo Rent A Car</div>             (advertisers, categories, hashtags)
 * Older exports used flat sibling _a6-g blocks with a header div; parseEntriesFlat keeps reading those (and messages).
 * No DOM is built (this runs in a worker); everything is regex over the raw HTML.
 */
export interface HtmlEntry { header: string; kv: Record<string, string>; ts: number | null; text: string; url?: string; leaves: string[]; raw: string }

const OPEN_DIV = /<(\/?)div\b([^>]*)>/gi;

/** Outermost _a6-g blocks, nesting-aware. */
export function outerBlocks(html: string): string[] {
  const out: string[] = []; const stack: boolean[] = []; let start = -1; let inside = 0;
  OPEN_DIV.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = OPEN_DIV.exec(html))) {
    if (!m[1]) { const isG = /class="[^"]*\b_a6-g\b/.test(m[2]); stack.push(isG); if (isG) { if (inside === 0) start = m.index; inside++; } }
    else { const wasG = stack.pop(); if (wasG) { inside--; if (inside === 0 && start >= 0) { out.push(html.slice(start, m.index + m[0].length)); start = -1; } } }
  }
  return out;
}

export function parseEntries(html: string): HtmlEntry[] {
  const blocks = outerBlocks(html);
  return blocks.map(readEntry);
}

function readEntry(raw: string): HtmlEntry {
  const kv: Record<string, string> = {};
  for (const m of raw.matchAll(/<td[^>]*class="[^"]*\b_a6_q\b[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*\b_a6_r\b[^"]*"[^>]*>([\s\S]*?)<\/td>/g)) { const k = text(m[1]); if (k && !(k in kv)) kv[k] = text(m[2]); }
  for (const m of raw.matchAll(/<td[^>]*colspan="2"[^>]*class="[^"]*\b_a6_q\b[^"]*"[^>]*>([^<]{1,80})<div>([\s\S]*?)<\/div><\/td>/g)) { const k = text(m[1]); if (k && !(k in kv) && m[2].length < 4000) kv[k] = text(m[2]); }
  // legacy label/value div pairs
  for (const m of raw.matchAll(/<div[^>]*>\s*([A-Z][A-Za-z ]{1,30})\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g)) { const k = text(m[1]); if (k && !(k in kv) && /^(Author|Time|Search|Username|Title|IP Address|User Agent|Saved on|Name|Interest|City Name|Comment|Media Owner|Email|Gender|Phone Number|Date of birth)$/i.test(k)) kv[k] = text(m[2]); }
  const heads = [...raw.matchAll(/<(?:div|h2)[^>]*class="[^"]*\b_a6-h\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|h2)>/g)].map((h) => text(h[1])).filter((h) => h && h !== 'Owner');
  const header = heads[0] ?? '';
  const stamps = [...raw.matchAll(/<div[^>]*class="[^"]*\b_a6-o\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((s) => text(s[1]));
  const flat = text(raw);
  const ts = findStamp(stamps[stamps.length - 1] ?? '') ?? isoOnly(header) ?? findStamp(kv.Time ?? '') ?? findStamp(kv['Saved on'] ?? '') ?? findStamp(kv['Creation time'] ?? '') ?? findStamp(kv.Date ?? '') ?? isoOnly(kv.Time) ?? (stamps.length || header ? null : findStamp(flat));
  const url = raw.match(/href="(https?:\/\/[^"]+)"/)?.[1];
  const leaves = [...raw.matchAll(/<div class="_a6-p">([^<]{1,300})<\/div>/g)].map((x) => text(x[1])).filter(Boolean);
  return { header, kv, ts: ts ?? findStamp(flat.slice(-80)), text: flat, url, leaves, raw };
}

/** Old flat layout: split on every _a6-g (used for messages and legacy exports). */
export function parseEntriesFlat(html: string): HtmlEntry[] {
  const out: HtmlEntry[] = [];
  const parts = html.split(/<div[^>]*class="[^"]*\b_a6-g\b[^"]*"[^>]*>/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const header = text(first(chunk, /<(?:div|h2)[^>]*class="[^"]*\b_a6-h\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|h2)>/) ?? '');
    const kv: Record<string, string> = {};
    for (const m of chunk.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) { const k = text(m[1]); if (k && !(k in kv)) kv[k] = text(m[2]); }
    const flat = text(chunk);
    out.push({ header, kv, ts: findStamp(kv.Time ?? '') ?? findStamp(flat), text: flat, leaves: [], raw: chunk });
  }
  return out;
}

const STAMP = /\b([A-Z][a-z]{2}) (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s?([ap]m)?\b/i;
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "Mar 17, 2026 11:48 pm" → ms. Instagram writes these without a zone; we read them as UTC (matches the JSON export's unix stamps). */
export function findStamp(s: string): number | null {
  const m = s.match(STAMP); if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()]; if (mo == null) return null;
  let h = Number(m[4]); const ap = m[7]?.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  return Date.UTC(Number(m[3]), mo, Number(m[2]), h, Number(m[5]), Number(m[6] ?? 0));
}
function isoOnly(v?: string) { return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? toMs(v) : null; }
function first(s: string, re: RegExp) { const m = s.match(re); return m?.[1]; }
export function text(s: string): string {
  return fixMojibake(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&(nbsp|emsp|ensp|thinsp);/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/\s+/g, ' ').trim());
}
const cap = (s?: string, n = 280) => (s && s.length > n ? s.slice(0, n) + '…' : s);
const owner = (e: HtmlEntry) => e.kv.Username || e.kv.Name || e.kv.Author || e.kv['Media Owner'] || (e.header && !/^\d{4}-/.test(e.header) ? e.header : undefined);
const tags = (e: HtmlEntry) => e.leaves.filter((l) => /^[\p{L}\p{N}_]{2,40}$/u.test(l)).slice(0, 12);

export async function parseInstagramHtml(a: Archive, paths: string[], events: Event[], claims: Claim[], files: string[], warnings: string[]) {
  const html = paths.filter((p) => p.endsWith('.html'));
  const load = async (p: string) => { files.push(p); return parseEntries(await a.text(p)); };
  const push = (p: string, kind: Event['kind'], e: HtmlEntry, extra: Partial<Event> = {}) => { if (e.ts) events.push({ ts: e.ts, source: 'instagram', kind, file: p, ...extra }); };
  const content = (e: HtmlEntry, meta: Record<string, string | number | boolean | undefined> = {}): Partial<Event> => { const tg = tags(e); return { actor: owner(e), title: cap(e.kv.Caption ?? e.kv.Title), url: e.url, meta: { ...meta, tags: tg.length ? tg.join(' ') : undefined } }; };
  const mask = (s: string) => s.replace(/[^@. ](?=[^@. ]{2})/g, '•');

  // ── content you saw, liked, saved, rejected (captions + owners + hashtags) ──
  for (const p of byName(html, /liked_posts\.html$/)) for (const e of await load(p)) push(p, 'like', e, content(e));
  for (const p of byName(html, /liked_comments\.html$/)) for (const e of await load(p)) push(p, 'like', e, { actor: owner(e), meta: { what: 'comment' } });
  for (const p of byName(html, /saved_posts\.html$/)) for (const e of await load(p)) push(p, 'save', e, content(e));
  const seen: [RegExp, Event['kind'], string?][] = [[/videos_watched\.html$/, 'watch', 'video'], [/stories_viewed\.html$/, 'watch', 'story'], [/(^|\/)posts_viewed\.html$/, 'watch', 'post'], [/suggested_(profiles|accounts)_viewed\.html$/, 'watch', 'suggested_account'], [/ads_viewed\.html$/, 'ad_view'], [/ads_clicked\.html$/, 'ad_click']];
  for (const [re, kind, what] of seen) for (const p of byName(html, re)) for (const e of await load(p)) push(p, kind, e, content(e, what ? { what } : {}));
  for (const p of byName(html, /posts_you're_not_interested_in\.html$|posts_you.re_not_interested_in\.html$/)) for (const e of await load(p)) push(p, 'other', e, content(e, { what: 'not_interested', surface: e.kv.Surface, how: e.kv.Source }));
  for (const p of byName(html, /posts_you're_interested_or_not_interested_in\.html$/)) for (const e of await load(p)) push(p, 'other', e, content(e, { what: 'interest_feedback', surface: e.kv.Surface, how: e.kv.Source ?? e.kv.Action }));
  for (const p of byName(html, /(account_searches|word_or_phrase_searches|profile_searches|recent_searches|searches)\.html$/)) for (const e of await load(p)) { const q = e.kv.Search ?? e.kv.Username ?? e.kv.Name ?? e.leaves[0] ?? (e.header && !/^\d{4}-/.test(e.header) ? e.header : undefined); if (q) push(p, 'search', e, { title: q }); }
  // ── your own content ──
  for (const p of byName(html, /(^|\/)(posts_\d+|posts|archived_posts|other_content)\.html$/)) if (!/ads_and_topics/.test(p)) for (const e of await load(p)) push(p, 'post', e, { title: cap(e.kv.Caption ?? e.kv.Title ?? e.header, 120), meta: { what: /archived/.test(p) ? 'archived' : 'post' } });
  for (const p of byName(html, /media\/stories\.html$|(^|\/)stories\.html$/)) for (const e of await load(p)) push(p, 'post', e, { title: 'story' });
  for (const p of byName(html, /(post_comments_\d+|reels_comments)\.html$/)) for (const e of await load(p)) push(p, 'comment', e, { title: cap(e.kv.Comment ?? e.header, 160), actor: e.kv['Media Owner'] });
  // ── messages (flat layout: one _a6-g per message) ──
  for (const p of byName(html, /\/messages\/(inbox|message_requests)\/[^/]+\/message_\d+\.html$/)) { files.push(p); const es = parseEntriesFlat(await a.text(p)); const folder = basename(p.split('/').slice(-2, -1)[0] ?? ''); const slug = folder.replace(/_\d{6,}$/, ''); const thread = /^instagramuser/.test(slug) ? `deleted account …${folder.slice(-4)}` : slug; const req = /message_requests/.test(p); for (const e of es) push(p, 'message', e, { actor: e.header, title: thread, value: e.text.length, meta: { request: req || undefined, media: /<(img|video|audio)\b|instagram\.com\/(p|reel)\//.test(e.raw) || undefined } }); }
  // ── security ──
  for (const p of byName(html, /login_activity\.html$/)) for (const e of await load(p)) push(p, 'login', e, { title: e.kv['User Agent'] ?? '', meta: { ip: maskIp(e.kv['IP Address'] ?? ''), lang: e.kv['Language Code'] } });
  for (const p of byName(html, /logout_activity\.html$/)) for (const e of await load(p)) push(p, 'other', e, { title: 'logout', meta: { what: 'logout', ip: maskIp(e.kv['IP Address'] ?? '') } });
  for (const p of byName(html, /profile_activity\.html$/)) for (const e of await load(p)) push(p, 'other', e, { title: e.kv.Type ?? 'account activity', meta: { what: 'account_activity', app: e.kv.App } });
  for (const p of byName(html, /(password_change_activity|profile_privacy_changes|profile_status_changes|account_privacy_changes)\.html$/)) for (const e of await load(p)) push(p, 'other', e, { title: e.kv.Type ?? e.kv.Status ?? e.header ?? 'account change', meta: { what: 'privacy_change' } });
  for (const p of byName(html, /devices\.html$/)) for (const e of await load(p)) { const v = e.kv['User Agent'] ?? e.header; if (v) claims.push({ source: 'instagram', field: 'device', value: v, file: p }); }
  for (const p of byName(html, /camera_information\.html$/)) claims.push({ source: 'instagram', field: 'camera_devices_logged', value: String((await load(p)).length), file: p });
  // ── what Meta decided about you ──
  for (const p of byName(html, /advertisers_using_your_activity_or_information\.html$/)) { files.push(p); const raw = await a.text(p); let added = 0;
    // new layout: section headers then one leaf div per advertiser
    const heads = [...raw.matchAll(/<td colspan="2" class="[^"]*_a6_q[^"]*">([^<]{10,300})<div>/g)];
    for (let i = 0; i < heads.length; i++) { const h = text(heads[i][1]); const seg = raw.slice(heads[i].index!, heads[i + 1]?.index ?? raw.length); const viaInteraction = /interactions you may have had|website, app or store/i.test(h);
      for (const m of seg.matchAll(/<div class="_a6-p">([^<]{1,200})<\/div>/g)) { const v = text(m[1]); if (v) { claims.push({ source: 'instagram', field: 'advertiser_audience', value: v, file: p, meta: { uploaded_list: !viaInteraction, remarketing: viaInteraction, in_store: false } }); added++; } } }
    // old layout: table rows with yes/no columns
    if (!added) for (const m of raw.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) { const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])); if (cells.length < 2 || /^advertiser/i.test(cells[0]) || !cells[0]) continue; const yes = (i: number) => /^(yes|true|✓|x)$/i.test(cells[i] ?? '');
      claims.push({ source: 'instagram', field: 'advertiser_audience', value: cells[0], file: p, meta: { uploaded_list: yes(1), remarketing: yes(2), in_store: yes(3) } }); } }
  for (const p of byName(html, /other_categories_used_to_reach_you\.html$/)) for (const e of await load(p)) for (const v of e.leaves) claims.push({ source: 'instagram', field: 'ad_category', value: v.trim(), file: p });
  for (const p of byName(html, /\/ai\/interest_categories\.html$|interest_categories\.html$/)) for (const e of await load(p)) { const v = e.kv.Interest; if (v) claims.push({ source: 'instagram', field: 'ai_interest', value: v.replace(/^the user (might be|is) interested in /i, '').trim(), file: p, meta: { updated: e.kv['Last updated time'] } }); }
  for (const p of byName(html, /ad_preferences\.html$/)) for (const e of await load(p)) push(p, 'other', e, { title: e.kv.Event ?? 'ad preference', actor: e.kv.Advertiser, meta: { what: 'ad_feedback', ad: cap(e.kv['Ad title'], 100) } });
  for (const p of byName(html, /information_you.ve_submitted_to_advertisers\.html$/)) for (const e of await load(p)) if (Object.keys(e.kv).length) claims.push({ source: 'instagram', field: 'submitted_to_advertiser', value: e.kv.Advertiser ?? e.kv.Company ?? e.kv['Business name'] ?? 'lead form', file: p });
  for (const p of byName(html, /ads_interests\.html$/)) for (const e of await load(p)) { const v = e.kv.Interest ?? e.kv.Name ?? e.header; if (v) claims.push({ source: 'instagram', field: 'ad_interest', value: v, file: p }); }
  for (const p of byName(html, /your_topics\.html$/)) for (const e of await load(p)) { const v = e.kv.Name ?? e.leaves[0] ?? e.header; if (v) claims.push({ source: 'instagram', field: 'topic', value: v, file: p }); }
  for (const p of byName(html, /see_less_topics\.html$/)) for (const e of await load(p)) { const v = e.kv.Name ?? e.kv.Topic ?? e.leaves[0]; if (v) claims.push({ source: 'instagram', field: 'see_less_topic', value: v, file: p }); else if (e.ts) push(p, 'other', e, { title: 'asked to see less of a topic', meta: { what: 'see_less' } }); }
  for (const p of byName(html, /recommended_topics\.html$/)) for (const e of await load(p)) { const v = e.kv.Name ?? e.header; if (v) claims.push({ source: 'instagram', field: 'recommended_topic', value: v, file: p }); }
  // ── who you are, where you are ──
  for (const p of byName(html, /profile_based_in\.html$/)) for (const e of await load(p)) { const v = e.kv.City ?? e.kv['City Name'] ?? e.kv.Region ?? e.header; if (v) claims.push({ source: 'instagram', field: 'profile_based_in', value: v, file: p }); }
  for (const p of byName(html, /locations_of_interest\.html$/)) for (const e of await load(p)) for (const v of e.leaves.length ? e.leaves : Object.values(e.kv).filter((x) => x.length < 60)) if (v && !/personalize/i.test(v)) claims.push({ source: 'instagram', field: 'location_of_interest', value: v, file: p });
  for (const p of byName(html, /personal_information\/personal_information\.html$|(^|\/)personal_information\.html$/)) for (const e of await load(p)) for (const k of ['Username', 'Name', 'Gender', 'Date of birth', 'Email', 'Phone Number', 'Private Account']) { const v = e.kv[k]; if (v) claims.push({ source: 'instagram', field: 'declared_' + k.toLowerCase().replace(/ /g, '_'), value: /Email|Phone/.test(k) ? mask(v) : v, file: p }); }
  for (const p of byName(html, /last_known_location\.html$/)) for (const e of await load(p)) { const lat = Number(e.kv['Imprecise Latitude'] ?? e.kv.Latitude), lon = Number(e.kv['Imprecise Longitude'] ?? e.kv.Longitude); if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) { claims.push({ source: 'instagram', field: 'last_known_location', value: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, file: p }); push(p, 'location', e, { title: 'last known location', lat, lon, meta: { semantic: 'LAST_KNOWN' } }); } }
  for (const p of byName(html, /autofill_information\.html$/)) { files.push(p); const t = text(await a.text(p)); const has = [/street|address/i.test(t) && 'address', /phone/i.test(t) && 'phone', /email/i.test(t) && 'email', /zip|postal/i.test(t) && 'postal code'].filter(Boolean); if (has.length) claims.push({ source: 'instagram', field: 'autofill_on_file', value: has.join(', '), file: p }); }
  for (const p of byName(html, /checkout_payment_information\.html$/)) { files.push(p); const t = text(await a.text(p)); if (/card|visa|mastercard|amex|paypal/i.test(t)) claims.push({ source: 'instagram', field: 'payment_method_on_file', value: 'yes', file: p }); }
  for (const p of byName(html, /signup_(information|details)\.html$/)) for (const e of await load(p)) { const t = e.ts ?? findStamp(e.kv.Time ?? ''); if (t) claims.push({ source: 'instagram', field: 'account_created', value: new Date(t).toISOString().slice(0, 10), file: p }); if (e.kv['IP Address']) claims.push({ source: 'instagram', field: 'signup_ip', value: maskIp(e.kv['IP Address']), file: p }); }
  // ── your network ──
  const count = async (re: RegExp, field: string) => { for (const p of byName(html, re)) claims.push({ source: 'instagram', field, value: String((await load(p)).length), file: p }); };
  await count(/followers_\d+\.html$/, 'followers_count'); await count(/(^|\/)following\.html$/, 'following_count'); await count(/synced_contacts\.html$/, 'synced_contacts_count');
  await count(/close_friends\.html$/, 'close_friends_count'); await count(/hide_story_from\.html$/, 'hide_story_from_count'); await count(/recently_unfollowed_profiles\.html$/, 'recently_unfollowed_count'); await count(/removed_suggestions\.html$/, 'removed_suggestions_count'); await count(/pending_follow_requests\.html$/, 'pending_follow_requests_count');
  // ── what you tapped ──
  for (const p of byName(html, /link_history\.html$/)) for (const e of await load(p)) { const url = e.kv['Website link you visited'] ?? e.kv['Website URL'] ?? e.kv['Website'] ?? e.kv.URL ?? e.url; const st = findStamp(e.kv['Website session start time'] ?? ''), en = findStamp(e.kv['Website session end time'] ?? ''); if (url) push(p, 'visit', e, { title: e.kv['Title of website page you visited'] ?? e.kv['Website title'] ?? e.kv.Title, url: String(url).split('?')[0], value: st && en && en > st ? en - st : undefined, meta: { via: 'in-app-browser' } }); }
  const story: [RegExp, string][] = [[/story_likes\.html$/, 'story_like'], [/polls\.html$/, 'poll'], [/quizzes\.html$/, 'quiz'], [/emoji_sliders\.html$/, 'emoji_slider'], [/questions\.html$/, 'question'], [/countdowns\.html$/, 'countdown']];
  for (const [re, what] of story) for (const p of byName(html, re)) for (const e of await load(p)) push(p, 'other', e, { actor: owner(e), title: cap(e.kv.Question ?? e.kv.Caption ?? what, 140), meta: { what: 'story_' + what } });
  for (const p of byName(html, /recently_viewed_items\.html$/)) for (const e of await load(p)) push(p, 'visit', e, { title: e.kv['Product Name'] ?? e.kv.Name ?? e.header, actor: e.kv['Merchant Name'], meta: { what: 'product' } });
  // off-Meta activity (old flat layout: one block per app, TYPE + timestamp lines)
  for (const p of byName(html, /your_activity_off_meta_technolog(y|ies)\.html$/)) { files.push(p); const raw = await a.text(p);
    for (const e of parseEntriesFlat(raw)) { const name = e.header; if (!name) continue;
      for (const m of e.text.matchAll(new RegExp(STAMP.source, 'gi'))) { const t = findStamp(m[0]); if (!t) continue; const before = e.text.slice(Math.max(0, m.index! - 40), m.index); const type = before.match(/\b([A-Z_]{4,})\b/)?.[1] ?? 'EVENT'; events.push({ ts: t, source: 'instagram', kind: 'off_platform', actor: name, title: type, file: p }); } } }
  if (byName(html, /your_activity_off_meta_technologies_settings\.html$/).length && !events.some((e) => e.kind === 'off_platform')) warnings.push('Instagram: "Your activity off Meta technologies" was not included in this download (only its settings page). Request it separately in Accounts Center to see which apps and sites report you to Meta.');
  // DM direction once we know the account's display name
  const me = claims.find((c) => c.field === 'declared_name')?.value ?? claims.find((c) => c.field === 'declared_username')?.value ?? '';
  if (me) for (const ev of events) if (ev.kind === 'message' && ev.actor) ev.meta = { ...(ev.meta ?? {}), from_me: ev.actor === me };
  if (events.length || claims.length) warnings.push('Instagram: parsed the HTML export. It works, but the JSON export is more complete (exact timestamps, every field). Next time pick Format: JSON.');
}
function maskIp(ip: string) { const m = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/); if (m) return m[1] + '.•.•'; if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':••'; return ip; }
