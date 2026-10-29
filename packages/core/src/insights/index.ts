import type { Claim, Event, ParseResult, Source } from '../types.js';
import { buildAttention, cap, localParts, type Attention } from './attention.js';
import { buildEras, detectShifts, weeklyMood, type Era, type Shift, type WeekMood } from './eras.js';
import { buildDossier, buildFlags, buildRoutine, type DossierRow, type Flag, type Routine } from './dossier.js';
import { classify, classifyEvent, MOOD_ORDER, type Mood } from './lexicon.js';

export * from './lexicon.js';
export * from './attention.js';
export * from './eras.js';
export * from './dossier.js';
export * from './letters.js';
export * from './social.js';
export * from './story.js';
export * from './wrapped.js';
import { buildWrapped, type Wrapped } from './wrapped.js';
import { buildFlows, buildPortrait, buildHabits, type Flows, type Statement, type Habits } from './story.js';
import { buildSocial, type SocialReport } from './social.js';

export interface Find { src: string; text: string; hint: string; file: string }
export interface Snitch { name: string; kind: 'uploaded' | 'pixel' | 'both'; events: number; means: string; file: string }
export interface FeedModel { source: Source; title: string; count: string; topics: { name: string; pct: number; because: string }[]; read: string; readWhy: string; hours: number[] }
export interface DumpCard { title: string; n: string; rows: { k: string; v: string }[]; file: string }
export interface Report {
  generatedAt: number; tz: string;
  sources: { source: Source; events: number; claims: number; files: number; warnings: string[] }[];
  totals: { events: number; claims: number; records: number };
  score: { value: number; parts: { k: string; v: number; note: string }[] };
  verdict: string; summary: string;
  dossier: DossierRow[]; flags: Flag[]; routine: Routine; attention: Attention;
  feeds: FeedModel[]; weeks: WeekMood[]; shifts: Shift[]; eras: Era[]; snitches: Snitch[]; dump: DumpCard[];
  actions: { title: string; desc: string; cta: string; delta: number; links?: string }[];
  finds: Find[];
  social: SocialReport[];
  flows: Flows; portrait: Statement[]; habits: Habits; wrapped: Wrapped;
  warnings: string[];
}

export function buildReport(results: ParseResult[], tz = 'UTC'): Report {
  const events = results.flatMap((r) => r.events).sort((a, b) => a.ts - b.ts);
  const claims = results.flatMap((r) => r.claims);
  const warnings = results.flatMap((r) => r.warnings);
  const attention = buildAttention(events, tz);
  const dossier = buildDossier(events, claims, tz);
  const flags = buildFlags(events, claims, tz);
  const routine = buildRoutine(events, claims, tz);
  const weeks = weeklyMood(events, tz); const shifts = detectShifts(weeks, events); const eras = buildEras(events, tz);
  const feeds = buildFeeds(events, claims, tz);
  const snitches = buildSnitches(events, claims);
  const dump = buildDump(events, claims, tz);
  const score = buildScore(events, claims, snitches, routine, dossier);
  const records = events.length + claims.length;
  const verdict = buildVerdict(dossier, feeds, attention, events, claims);
  const summary = buildSummary(dossier, routine, attention, feeds, tz, events);
  return {
    generatedAt: Date.now(), tz,
    sources: results.map((r) => ({ source: r.source, events: r.events.length, claims: r.claims.length, files: r.files.length, warnings: r.warnings })),
    totals: { events: events.length, claims: claims.length, records }, score, verdict, summary, dossier, flags, routine, attention, feeds, weeks, shifts, eras, snitches, dump,
    actions: buildActions(score, routine, snitches, dossier), finds: buildFinds(events, claims, routine, snitches, feeds, attention), ...(() => { const flows = buildFlows(events, claims); const habits = buildHabits(events, tz); return { flows, habits, wrapped: buildWrapped(events, claims, habits, flows, tz) }; })(), portrait: buildPortrait(events, claims, tz), social: (['instagram', 'tiktok', 'x', 'snapchat'] as const).map((s) => buildSocial(events, claims, tz, s)).filter((x): x is SocialReport => !!x), warnings,
  };
}

/** The "tap to reveal" moments. Each must be true from the data and safe to show (no coordinates, no addresses). */
function buildFinds(events: Event[], claims: Claim[], routine: Routine, snitches: Snitch[], feeds: FeedModel[], attention: Attention): Find[] {
  const out: Find[] = [];
  const homeClaim = claims.find((c) => c.field === 'inferred_home');
  if (homeClaim) out.push({ src: 'GOOGLE', text: 'Google labelled your home address on its own. You never typed it anywhere.', hint: homeClaim.confidence ? `probability ${Math.round(homeClaim.confidence * 100)}% in the export` : 'from overnight dwell', file: homeClaim.file });
  if (routine.transport && routine.transport.trips > 20) out.push({ src: 'GOOGLE', text: `Google guessed how you travel on ${routine.transport.trips.toLocaleString()} trips: ${routine.transport.mode.replace(/_/g, ' ').toLowerCase()}, ${Math.round(routine.transport.prob * 100)}% sure.`, hint: 'activitySegment.activities[].probability', file: routine.transport.file });
  const bank = events.filter((e) => e.kind === 'off_platform' && /bank|td|rbc|scotia|bmo|cibc|tangerine|wealthsimple|paypal|wise/i.test(e.actor ?? ''));
  if (bank.length > 10) out.push({ src: 'META', text: `A finance app told Meta about ${bank.length.toLocaleString()} of your sessions, including logins.`, hint: `${bank[0].actor} · via the Meta SDK/pixel`, file: bank[0].file });
  const up = snitches.filter((s) => s.kind !== 'pixel');
  if (up.length) out.push({ src: 'META', text: `${up.length} companies uploaded your email or phone number to find you in the ads system. ${up.slice(0, 3).map((s) => s.name).join(', ')}${up.length > 3 ? '…' : ''}.`, hint: 'has_data_file_custom_audience: true', file: up[0].file });
  const alexa = events.filter((e) => e.source === 'google' && e.meta?.audio); const assistant = alexa.length;
  if (assistant > 20) out.push({ src: 'GOOGLE', text: `${assistant.toLocaleString()} voice recordings are still stored, with transcripts.`, hint: 'audioFiles[] in My Activity', file: alexa[0].file });
  const pushed = feeds.flatMap((f) => f.topics.filter((t) => /none searched/.test(t.because) && t.pct >= 10).map((t) => ({ f, t })))[0];
  if (pushed) out.push({ src: cap(pushed.f.source).toUpperCase(), text: `You never searched for “${pushed.t.name}”. It's ${pushed.t.pct}% of your ${cap(pushed.f.source)} feed anyway.`, hint: 'zero matching searches, recommendations only', file: '' });
  const ips = claims.find((c) => c.field === 'unique_ips'); const loginIps = new Set(events.filter((e) => e.kind === 'login').map((e) => String(e.meta?.ip ?? '')).filter(Boolean));
  const nIp = Math.max(Number(ips?.value ?? 0), loginIps.size);
  if (nIp > 8) out.push({ src: 'LOGINS', text: `${nIp} different IP addresses are on file. Each one is a place you were, with a timestamp.`, hint: 'login history / access log', file: ips?.file ?? events.find((e) => e.kind === 'login')?.file ?? '' });
  const msgs = events.filter((e) => e.kind === 'message'); if (msgs.length > 500) out.push({ src: 'MESSAGES', text: `${msgs.length.toLocaleString()} of your private messages are in the export, including conversations you deleted from the app.`, hint: 'we counted them; we did not read them', file: msgs[0].file });
  if (attention.nightShare > 0.3) out.push({ src: 'DELIVERY', text: `${Math.round(attention.nightShare * 100)}% of what you consume happens between 10 pm and 2 am. Platforms price ads higher in that window because you resist less.`, hint: 'timestamps on watches and plays', file: '' });
  const late = events.filter((e) => e.kind === 'search' && /\b(symptom|doctor|pain|anxiety|depress|std|pregnan|therapy|rash|dose|mg)\b/i.test(e.title ?? '')).length;
  if (late > 3) out.push({ src: 'SEARCH', text: `${late} health-related searches sit in your history like any other query.`, hint: 'My Activity / Search', file: events.find((e) => e.kind === 'search')?.file ?? '' });
  const inst = events.filter((e) => e.kind === 'install'); const old = inst.length ? Math.min(...inst.map((i) => i.ts)) : 0;
  if (inst.length > 20 && old) out.push({ src: 'PLAY STORE', text: `Every app you ever installed is still listed, back to ${new Date(old).getFullYear()}, including the ones you deleted the same day.`, hint: 'Google Play Store/Installs.json', file: inst[0].file });
  return out.slice(0, 6);
}

function buildFeeds(events: Event[], claims: Claim[], tz: string): FeedModel[] {
  const out: FeedModel[] = [];
  const perSrc: Partial<Record<Source, Event[]>> = {}; for (const e of events) if (['watch', 'like', 'save', 'search', 'play'].includes(e.kind)) (perSrc[e.source] ??= []).push(e);
  const platformTopics: Partial<Record<Source, Claim[]>> = {}; for (const c of claims) if (c.field === 'topic' || c.field === 'ad_interest') (platformTopics[c.source] ??= []).push(c);
  for (const src of ['instagram', 'tiktok', 'youtube', 'spotify', 'x', 'apple'] as Source[]) {
    const evs = perSrc[src] ?? []; const pt = platformTopics[src] ?? []; if (evs.length < 20 && !pt.length) continue;
    const tcount: Record<string, { n: number; searched: number; sample: string; chosen: number }> = {};
    for (const e of evs) { const { topic } = classifyEvent(e); if (topic === 'Other') continue; const t = (tcount[topic] ??= { n: 0, searched: 0, sample: '', chosen: 0 }); t.n++; if (e.kind === 'search') t.searched++; if (e.kind === 'like' || e.kind === 'save') t.chosen++; if (!t.sample && e.title) t.sample = e.title.slice(0, 60); }
    const total = Object.values(tcount).reduce((n, t) => n + t.n, 0) || 1;
    const topics = Object.entries(tcount).sort((a, b) => b[1].n - a[1].n).slice(0, 7).map(([name, t]) => ({ name, pct: Math.round((t.n / total) * 100), because: t.searched ? `${t.n} items; ${t.searched} came from your own searches${t.sample ? `, e.g. “${t.sample}”` : ''}` : `${t.n} items, none searched. Pushed by the feed${t.chosen ? `; you liked/saved ${t.chosen}` : ''}` }));
    // platform's own labels get appended as "declared by platform"
    for (const c of pt.slice(0, 5)) if (!topics.some((t) => t.name.toLowerCase() === c.value.toLowerCase())) topics.push({ name: c.value, pct: 0, because: `Listed by ${cap(src)} itself in ${c.file.split('/').pop()}` });
    const hours = Array(24).fill(0); for (const e of evs) hours[localParts(e.ts, tz).hour]++;
    const mx = Math.max(1, ...hours); const hoursPct = hours.map((h) => Math.round((h / mx) * 100));
    const top = topics[0]; const mood = top ? classify(top.name + ' ' + top.because).mood : 'Neutral';
    const readMap: Record<string, string> = { Aspire: 'Wants to own things and is researching how.', Learn: 'Learns by watching; will sit through long explainers.', Comfort: 'Uses the feed to wind down.', Doom: 'Gets pulled into crisis content, usually late.', Funny: 'Here for the laughs; low commercial intent.', Social: 'Relationship-focused content dominates.', Neutral: 'Not enough labelled content to read.' };
    const peakH = hours.indexOf(Math.max(...hours));
    out.push({ source: src, title: ({ instagram: 'your_topics.json + impressions', tiktok: 'Watch History + Ad Interests', youtube: 'watch-history.json', spotify: 'Streaming history', x: 'personalization.js', apple: 'Apple Music play activity' } as Record<string, string>)[src] ?? src, count: `${evs.length.toLocaleString()} items`, topics,
      read: `“${readMap[mood]}”`, readWhy: top ? `Top topic is ${top.name} at ${top.pct}%. ${topics.filter((t) => /none searched/.test(t.because)).length} of your top ${topics.length} topics were never searched for; the feed introduced them. Peak hour ${String(peakH).padStart(2, '0')}:00.` : 'Add more data to read this feed.', hours: hoursPct });
  }
  return out;
}

function buildSnitches(events: Event[], claims: Claim[]): Snitch[] {
  const map: Record<string, Snitch> = {};
  for (const c of claims) if (c.field === 'advertiser_audience' || c.field === 'lookalike_advertiser') { const up = !!c.meta?.uploaded_list || c.field === 'advertiser_audience' && c.source === 'x'; const s = (map[c.value] ??= { name: c.value, kind: up ? 'uploaded' : 'pixel', events: 0, means: '', file: c.file }); if (up) s.kind = s.kind === 'pixel' ? 'both' : 'uploaded'; }
  for (const e of events) if (e.kind === 'off_platform' && e.actor) { const s = (map[e.actor] ??= { name: e.actor, kind: 'pixel', events: 0, means: '', file: e.file }); s.events++; if (s.kind === 'uploaded') s.kind = 'both'; }
  for (const s of Object.values(map)) s.means = s.kind === 'uploaded' ? 'Uploaded your email or phone to find you. You are in their customer database.' : s.kind === 'both' ? 'Has your contact info AND reports your activity on their site or app.' : s.events ? `Reported ${s.events} of your actions (page views, purchases, logins) via a tracking pixel or SDK.` : 'Targets you via remarketing: they tracked a visit.';
  return Object.values(map).sort((a, b) => (b.kind === 'both' ? 2 : b.kind === 'uploaded' ? 1 : 0) - (a.kind === 'both' ? 2 : a.kind === 'uploaded' ? 1 : 0) || b.events - a.events);
}

function buildDump(events: Event[], claims: Claim[], tz = 'UTC'): DumpCard[] {
  const n = (f: (e: Event) => boolean) => events.filter(f).length; const file = (f: (e: Event) => boolean) => events.find(f)?.file ?? '';
  const cards: DumpCard[] = [];
  const loc = n((e) => e.kind === 'location'); const trips = n((e) => e.kind === 'trip');
  if (loc || trips) cards.push({ title: 'Location', n: (loc + trips).toLocaleString(), file: file((e) => e.kind === 'location' || e.kind === 'trip'), rows: [{ k: 'Place visits / pings', v: `${loc.toLocaleString()} logged, ${n((e) => e.kind === 'location' && !!e.meta?.semantic).toLocaleString()} labelled with a place` }, { k: 'Trips with guessed transport mode', v: trips.toLocaleString() }, ...(claims.find((c) => c.field === 'raw_location_pings') ? [{ k: 'Raw GPS pings', v: Number(claims.find((c) => c.field === 'raw_location_pings')!.value).toLocaleString() }] : [])] });
  const logins = events.filter((e) => e.kind === 'login'); const ips = new Set(logins.map((e) => String(e.meta?.ip ?? '')).filter(Boolean)); const devs = claims.filter((c) => c.field === 'device');
  if (logins.length || devs.length) cards.push({ title: 'Devices & logins', n: String(logins.length + devs.length), file: logins[0]?.file ?? devs[0]?.file ?? '', rows: [{ k: 'Login events', v: `${logins.length}, with IP and user agent` }, { k: 'Distinct IP addresses', v: `${ips.size || claims.find((c) => c.field === 'unique_ips')?.value || 0}. Each resolves to a place you were.` }, { k: 'Devices on file', v: `${new Set(devs.map((d) => d.value)).size}` }, ...(claims.find((c) => c.field === 'carrier') ? [{ k: 'Carrier', v: claims.find((c) => c.field === 'carrier')!.value }] : [])] });
  const msgs = events.filter((e) => e.kind === 'message'); if (msgs.length) { const threads = new Set(msgs.map((m) => m.title)); const late = msgs.filter((m) => { const h = localParts(m.ts, tz).hour; return h >= 0 && h < 4; }).length; cards.push({ title: 'Messages', n: msgs.length.toLocaleString(), file: msgs[0].file, rows: [{ k: 'Conversations', v: String(threads.size) }, { k: 'Messages kept in export', v: `${msgs.length.toLocaleString()} (content stays on your device; we only count)` }, { k: 'Sent after midnight (approx.)', v: String(late) }] }); }
  const srch = events.filter((e) => e.kind === 'search'); if (srch.length) { const health = srch.filter((s) => /\b(symptom|doctor|pain|anxiety|depress|std|pregnan|therapy|rash|dose|mg)\b/i.test(s.title ?? '')).length; const legal = srch.filter((s) => /\b(lawyer|sue|court|divorce|arrest|charge|visa|immigration)\b/i.test(s.title ?? '')).length; cards.push({ title: 'Searches', n: srch.length.toLocaleString(), file: srch[0].file, rows: [{ k: 'Across platforms', v: Object.entries(srch.reduce((m, s) => ((m[s.source] = (m[s.source] ?? 0) + 1), m), {} as Record<string, number>)).map(([k, v]) => `${cap(k)} ${v}`).join(' · ') }, { k: 'Health-related', v: `${health}. Google keeps these like any other query.` }, { k: 'Legal / immigration-related', v: String(legal) }] }); }
  const watch = events.filter((e) => e.kind === 'watch' || e.kind === 'play'); if (watch.length) cards.push({ title: 'Watches & plays', n: watch.length.toLocaleString(), file: watch[0].file, rows: [{ k: 'By platform', v: Object.entries(watch.reduce((m, s) => ((m[s.source] = (m[s.source] ?? 0) + 1), m), {} as Record<string, number>)).map(([k, v]) => `${cap(k)} ${v.toLocaleString()}`).join(' · ') }, { k: 'Ads seen', v: n((e) => e.kind === 'ad_view').toLocaleString() }, { k: 'Ads clicked', v: n((e) => e.kind === 'ad_click').toLocaleString() }] });
  const off = events.filter((e) => e.kind === 'off_platform'); const adv = claims.filter((c) => c.field === 'advertiser_audience'); if (off.length || adv.length) cards.push({ title: 'Third parties', n: String(new Set([...off.map((o) => o.actor), ...adv.map((a) => a.value)]).size), file: off[0]?.file ?? adv[0]?.file ?? '', rows: [{ k: 'Apps & sites reporting your activity', v: String(new Set(off.map((o) => o.actor)).size) }, { k: 'Events they reported', v: off.length.toLocaleString() }, { k: 'Advertisers who uploaded your contact info', v: String(adv.filter((a) => a.meta?.uploaded_list).length) }] });
  const health = events.filter((e) => e.kind === 'health'); if (health.length) { const sleep = health.filter((h) => h.title === 'sleep'); const avgSleep = sleep.length ? sleep.reduce((n2, s) => n2 + (s.value ?? 0), 0) / sleep.length / 3600000 : 0; cards.push({ title: 'Health', n: health.length.toLocaleString(), file: health[0].file, rows: [{ k: 'Sleep records', v: `${sleep.length}${avgSleep ? `, avg segment ${avgSleep.toFixed(1)} h` : ''}` }, { k: 'Daily step totals', v: String(health.filter((h) => h.title === 'StepCount').length) }, { k: 'Workouts', v: String(health.filter((h) => h.title === 'workout').length) }] }); }
  const inst = events.filter((e) => e.kind === 'install'); if (inst.length) cards.push({ title: 'Apps installed', n: String(inst.length), file: inst[0].file, rows: [{ k: 'Lifetime installs on record', v: `${inst.length}, including apps deleted years ago` }, { k: 'Oldest', v: new Date(Math.min(...inst.map((i) => i.ts))).toISOString().slice(0, 10) }] });
  return cards;
}

function buildScore(events: Event[], claims: Claim[], snitches: Snitch[], routine: Routine, dossier: DossierRow[]) {
  const parts = [
    { k: 'Location exposure', v: Math.min(25, Math.round(Math.log10(1 + routine.pings) * 5) + (routine.home ? 5 : 0) + (routine.work ? 3 : 0)), note: routine.home ? 'Home and routine are reconstructible.' : 'No location data found.' },
    { k: 'Third-party tracking', v: Math.min(25, Math.round(Math.sqrt(snitches.length) * 2.2)), note: `${snitches.length} companies hold or report your data.` },
    { k: 'Inferred profile depth', v: Math.min(20, dossier.length * 2 + claims.filter((c) => /inferred|ad_interest|topic/.test(c.field)).length / 10), note: `${dossier.length} inferred attributes, ${claims.filter((c) => /ad_interest|topic/.test(c.field)).length} interest labels.` },
    { k: 'Behavioural record', v: Math.min(20, Math.round(Math.log10(1 + events.length) * 3.5)), note: `${events.length.toLocaleString()} timestamped events.` },
    { k: 'Identity & devices', v: Math.min(10, claims.filter((c) => /device|carrier|unique_ips|declared_/.test(c.field)).length), note: 'Devices, carrier, IPs and declared identifiers on file.' },
  ].map((p) => ({ ...p, v: Math.round(p.v) }));
  return { value: Math.min(100, parts.reduce((n, p) => n + p.v, 0)), parts };
}

function buildVerdict(dossier: DossierRow[], feeds: FeedModel[], attention: Attention, events: Event[] = [], claims: Claim[] = []) {
  const bits: string[] = [];
  const age = dossier.find((d) => d.field === 'AGE')?.value; const housing = dossier.find((d) => d.field === 'HOUSING'); const chrono = dossier.find((d) => d.field === 'CHRONOTYPE')?.value;
  const best = feeds.filter((f) => f.topics.some((t) => t.pct > 0)).sort((a, b) => (b.topics[0]?.pct ?? 0) * (parseInt(b.count.replace(/\D/g, '')) || 1) - (a.topics[0]?.pct ?? 0) * (parseInt(a.count.replace(/\D/g, '')) || 1))[0];
  const topTopic = best?.topics.find((t) => t.pct > 0)?.name;
  if (chrono === 'Night owl') bits.push('Night-owl');
  if (topTopic) bits.push(topicAdj(topTopic));
  if (!dossier.length && !feeds.length) return '“Not enough data yet.”';
  // Prefer what you actually watch (captions) and the platform's own segment labels over generic guesses.
  const content = events.filter((e) => ['watch', 'like', 'save'].includes(e.kind) && (e.title || e.meta?.tags)); const tc: Record<string, number> = {};
  for (const e of content) { const { topic } = classifyEvent(e); if (topic !== 'Other') tc[topic] = (tc[topic] ?? 0) + 1; }
  const feedTopic = content.length > 200 ? Object.entries(tc).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
  const seg = claims.find((c) => c.field === 'ad_category' && /away from hometown|away from family|expat|new job|recently moved|engaged|newlywed|new parent|frequent travel/i.test(c.value))?.value;
  if (feedTopic) { const out: string[] = []; if (chrono === 'Night owl') out.push('Night-owl'); out.push(topicAdj(feedTopic)); if (seg) out.push(seg.replace(/^./, (x) => x.toUpperCase())); if (age && !/\d{4}/.test(age)) out.push(age); return `“${out.join(', ')}.”`; }
  bits.push(housing ? 'Renter' : 'Consumer');
  if (age && !/\d{4}/.test(age)) bits.push(age);
  if (housing) bits.push('Likely to Move');
  return bits.length ? `“${bits.join(', ')}.”` : '“Not enough data yet.”';
}
function topicAdj(t: string) { return ({ 'Real estate & property': 'Property-hunting', 'Finance & investing': 'Market-watching', 'AI & tech': 'Tech-obsessed', 'Gaming': 'Gamer', 'Music': 'Music-first', 'Cooking & food': 'Food-driven', 'Cars & EVs': 'Car-shopping', 'Luxury & watches': 'Aspirational', 'Fitness & health': 'Fitness-focused', 'Sports': 'Sports-obsessed', 'Comedy & memes': 'Meme-fed', 'Travel': 'Travel-dreaming', 'Arab & Middle East culture': 'Diaspora-connected', 'Spirituality & religion': 'Faith-minded', 'Podcasts & interviews': 'Podcast-brained', 'Documentaries & explainers': 'Explainer-addicted', 'News & politics': 'News-anxious', 'Crash & layoff content': 'Doom-scrolling' } as Record<string, string>)[t] ?? 'Curious';
}
function buildSummary(dossier: DossierRow[], routine: Routine, attention: Attention, feeds: FeedModel[], tz: string, events: Event[] = []) {
  const s: string[] = [];
  const age = dossier.find((d) => d.field === 'AGE')?.value; const gender = dossier.find((d) => d.field === 'GENDER')?.value; const city = dossier.find((d) => d.field === 'HOME CITY')?.value; const homeRow = dossier.find((d) => d.field === 'HOME');
  s.push([age && !/\d{4}/.test(age) ? `A ${age}-year-old` : 'Someone', gender ? gender.toLowerCase() : '', city ? `based in ${city}` : homeRow ? 'whose home address Google labelled on its own' : ''].filter(Boolean).join(' '));
  if (routine.transport) s.push(`who moves mostly by ${routine.transport.mode.toLowerCase().replace(/_/g, ' ')}`);
  if (routine.work) s.push('and leaves home for work on weekdays');
  const housing = dossier.find((d) => d.field === 'HOUSING'); if (housing) s.push(`, ${housing.value.toLowerCase()}`);
  const emp = dossier.find((d) => d.field === 'EMPLOYMENT'); if (emp) s.push(', runs a small business');
  if (attention.totals.consumed > 50) s.push(`, spends ${attention.peak.label} on ${feeds.slice(0, 2).map((f) => cap(f.source)).join(' and ') || 'the feeds'}`);
  const bestFeed = feeds.filter((f) => f.topics.some((t) => t.pct > 0)).sort((a, b) => (parseInt(b.count.replace(/\D/g, '')) || 0) - (parseInt(a.count.replace(/\D/g, '')) || 0))[0]; const bt = bestFeed?.topics.find((t) => t.pct > 0);
  const content = events.filter((e) => ['watch', 'like', 'save'].includes(e.kind) && (e.title || e.meta?.tags)); const tc: Record<string, number> = {}; for (const e of content) { const { topic } = classifyEvent(e); if (topic !== 'Other') tc[topic] = (tc[topic] ?? 0) + 1; }
  const ct = content.length > 200 ? Object.entries(tc).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
  if (ct) s.push(`, and what they watch and like is mostly ${ct.toLowerCase()}`); else if (bt) s.push(`, and right now ${cap(bestFeed!.source)}'s algorithm thinks they want ${bt.name.toLowerCase()}`);
  if (routine.secondBase) s.push(`, with a second base ${routine.secondBase.label.replace('Second base · ', '')}`);
  return s.join(' ').replace(/\s+,/g, ',') + '.';
}
function buildActions(score: Report['score'], routine: Routine, snitches: Snitch[], dossier: DossierRow[]) {
  const a: Report['actions'] = [];
  if (routine.home) a.push({ title: 'Wipe Timeline', desc: 'Delete Google Location History and turn off future logging. Removes “Home”, “Work” and the transport guesses.', cta: 'Show me how', delta: -score.parts[0].v, links: 'google' });
  if (snitches.length) a.push({ title: 'Disconnect off-platform activity', desc: `Clear the ${snitches.length} companies reporting you and stop new pixel reports being tied to your account.`, cta: 'Open settings', delta: -Math.round(score.parts[1].v * 0.7), links: 'instagram' });
  a.push({ title: 'Reset your advertising ID', desc: 'Breaks the link trackers use between apps. Ten seconds in phone settings.', cta: 'How', delta: -Math.min(8, score.parts[4].v), links: 'ios' });
  a.push({ title: 'Send access & deletion letters', desc: 'Pre-written PIPEDA/GDPR requests for every company on this page. They must answer in 30 days.', cta: 'Draft letters', delta: -Math.round(score.parts[1].v * 0.3), links: 'letters' });
  if (dossier.length) a.push({ title: 'Dispute the dossier', desc: 'Turn off interest labels you consider wrong so lookalike models stop copying them.', cta: 'Review labels', delta: -Math.min(6, score.parts[2].v), links: 'tiktok' });
  return a;
}
export { MOOD_ORDER }; export type { Mood };
