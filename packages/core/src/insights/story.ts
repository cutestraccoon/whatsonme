import type { Claim, Event, Source } from '../types.js';
import { localParts, cap } from './attention.js';
import { classifyEvent } from './lexicon.js';

/* ───────────────────────── WHO HAS YOUR DATA ───────────────────────── */

export interface PlatformHolding { source: string; items: { what: string; detail: string; n?: number; sensitive?: boolean }[] }
export interface Industry { name: string; n: number; examples: string[] }
export interface Partner { name: string; to: string; events: number; types: string[]; first: string; last: string; named: boolean }
export interface Clicked { advertiser: string; platform: string; n: number; last: string; title?: string }
export interface Flows {
  holdings: PlatformHolding[];
  advertisers: { total: number; uploaded: number; viaInteraction: number; industries: Industry[]; sample: string[]; names: string[] };
  partners: Partner[];                 // apps/sites that report your activity to a platform
  partnerTotal: number;
  clicked: Clicked[];                  // ads you clicked: the advertiser received a click ID tied to you
  sites: { domain: string; n: number }[]; // sites opened in an in-app browser (the platform saw them)
  youGave: { what: string; detail: string }[];
  headline: string;
}

const INDUSTRIES: [string, RegExp][] = [
  ['Ad agencies & data brokers', /\b(agency|agence|media|mediacom|mindshare|omd|phd|publicis|dentsu|havas|wpp|groupm|group m|socialyse|assembly|carat|starcom|zenith|wavemaker|essence|hearts ?& ?science|1:1|crm|audience|data|liveramp|acxiom|experian|epsilon|oracle|digital|programmatic|performance|marketing|ads?|adm\b|lookalike|custom)\b/i],
  ['Travel, airlines & hotels', /\b(air(lines?|ways)?|emirates|westjet|porter|flair|qatar|etihad|lufthansa|klm|delta|united|aeromexico|hotel|resort|marriott|hilton|hyatt|ihg|accor|expedia|booking|airbnb|vrbo|trip|travel|tour|cruise|rent a car|alamo|hertz|avis|enterprise|budget|national car|vacation)\b/i],
  ['Banks, insurance & finance', /\b(bank|banque|credit|card|capital|financ\w*|invest\w*|insur\w*|assur\w*|loan|lend\w*|mortgage|wealth|rbc|td\b|scotia\w*|bmo|cibc|desjardins|tangerine|simplii|questrade|wealthsimple|koho|neo financial|amex|american express|visa|mastercard|paypal|klarna|affirm|crypto|coinbase|binance|kraken|sun life|manulife|intact|aviva|allstate|tax)\b/i],
  ['Shopping, fashion & retail', /\b(shop|store|stores|mart|retail|outlet|apparel|fashion|cloth\w*|wear|shoes?|sneaker|nike|adidas|puma|zara|h&m|uniqlo|gap|old navy|lululemon|aritzia|sephora|ulta|walmart|costco|canadian tire|best ?buy|amazon|temu|shein|aliexpress|ebay|etsy|wayfair|ikea|the bay|hudson|simons|winners|marshalls|sport chek|foot locker|jewel\w*|beauty|cosmetic\w*|skin\w*)\b/i],
  ['Food, drink & delivery', /\b(food\w*|restaurant|pizza|burger|grill|kitchen|cafe|caf[eé]|coffee|tim hortons|starbucks|mcdonald|wendy|kfc|subway|popeyes|chipotle|uber ?eats|doordash|skip|instacart|grocer\w*|loblaw|metro|sobeys|no frills|freshco|bakery|tea|drink|beer|brew\w*|wine|spirits|snack)\b/i],
  ['Cars & mobility', /\b(auto\w*|motor\w*|car(s|go)?\b|toyota|honda|ford|bmw|mercedes|audi|tesla|hyundai|kia|nissan|mazda|subaru|lexus|acura|chevrolet|chevy|gm\b|volkswagen|vw|porsche|jeep|dodge|ram\b|volvo|polestar|rivian|dealer\w*|uber\b|lyft|tires?)\b/i],
  ['Real estate & home', /\b(realty|real estate|realtor|homes?|condo\w*|propert\w*|develop\w*|construction|builders?|living|apartments?|rental|furniture|decor|reno\w*|mortgage)\b/i],
  ['Telecom, tech & apps', /\b(rogers|bell|telus|fido|koodo|freedom|virgin|chatr|public mobile|apple|samsung|google|microsoft|meta|adobe|framer|canva|notion|shopify|software|app|apps|tech\w*|cloud|saas|ai\b|vpn|wireless|mobile|internet|electronics)\b/i],
  ['Media, sports & entertainment', /\b(tv|music|records|spotify|netflix|disney|crave|prime video|paramount|hbo|cinema|cineplex|theat(er|re)|tickets?|ticketmaster|live nation|festival|concert|sports?|nba|nfl|nhl|mlb|fc\b|f\.c\.|football|soccer|games?|gaming|xbox|playstation|nintendo|steam|ea\b|ubisoft|news|magazine|podcast|studio\w*|entertainment|film)\b/i],
  ['Health, fitness & wellness', /\b(health\w*|clinic|pharma\w*|drug|shoppers drug|rexall|gym|fitness|goodlife|planet fitness|yoga|dental|dentist|medical|med\w*spa|wellness|vitamin|supplement|nutrition|protein|therapy|physio|optical|vision)\b/i],
  ['Education & jobs', /\b(universit\w*|college|school|academy|course|learn\w*|education|bootcamp|jobs?|career\w*|recruit\w*|indeed|linkedin)\b/i],
  ['Government & non-profit', /\b(government|gouvernement|canada\.ca|ontario|city of|ville de|municipal|foundation|charity|non-?profit|ngo|red cross|unicef|hospital)\b/i],
];
export function industryOf(name: string): string { for (const [n, re] of INDUSTRIES) if (re.test(name)) return n; return 'Other / unclear'; }

export function buildFlows(events: Event[], claims: Claim[]): Flows {
  const bySrc = (s: string) => events.filter((e) => e.source === s);
  const cl = (s: string, f: string | RegExp) => claims.filter((c) => c.source === s && (typeof f === 'string' ? c.field === f : f.test(c.field)));
  const sources = [...new Set([...events.map((e) => e.source), ...claims.map((c) => c.source)])].filter((s) => s !== 'youtube' || !events.some((e) => e.source === 'google'));
  const holdings: PlatformHolding[] = [];
  for (const s of sources) {
    const ev = bySrc(s); const items: PlatformHolding['items'] = []; const n = (k: string) => ev.filter((e) => e.kind === k).length;
    const add = (what: string, detail: string, count?: number, sensitive = false) => { if (count === undefined || count > 0) items.push({ what, detail, n: count, sensitive }); };
    const msgs = ev.filter((e) => e.kind === 'message'); if (msgs.length) add('Private messages', `${msgs.length.toLocaleString()} messages in ${new Set(msgs.map((m) => m.title)).size} chats, with timestamps and who sent them`, msgs.length, true);
    const gps = cl(s, 'last_known_location')[0]; const based = cl(s, 'profile_based_in')[0]; const loi = cl(s, 'location_of_interest'); const locEv = ev.filter((e) => e.kind === 'location' || e.kind === 'trip').length;
    if (gps || based || loi.length || locEv) add('Where you are', [gps && `a recent GPS fix${/·/.test(gps.value) ? ` near ${gps.value.split('·').pop()!.trim().replace(/^[A-Z]{2}\((.+)\)$/, '$1')}` : ''}`, based && `home city: ${based.value}`, loi.length && `${loi.length} “locations of interest”`, locEv && `${locEv.toLocaleString()} location records`].filter(Boolean).join(' · '), undefined, true);
    const dob = cl(s, /declared_(date_of_birth|birthdate|birthday)/)[0]; const phone = cl(s, /declared_(phone|telephone)/)[0]; const email = cl(s, /declared_email/)[0];
    if (dob || phone || email) add('Identity', ['exact birthdate', phone && 'phone number', email && 'email'].filter((x, i) => i ? x : dob).join(', '), undefined, true);
    const contacts = cl(s, 'synced_contacts_count')[0]; if (contacts && Number(contacts.value)) add('Your address book', `${Number(contacts.value).toLocaleString()} contacts you synced, including people who never signed up`, Number(contacts.value), true);
    const logins = ev.filter((e) => e.kind === 'login'); const ips = new Set(logins.map((e) => String(e.meta?.ip ?? '')).filter(Boolean)); const devs = new Set(cl(s, 'device').map((c) => c.value));
    if (logins.length) add('Devices & logins', `${logins.length.toLocaleString()} logins from ${ips.size} network addresses${devs.size ? `, ${devs.size} device models` : ''}${cl(s, 'device_identifier').length ? ', plus a persistent device ID' : ''}`, logins.length);
    const watch = n('watch'); if (watch) add('What you watched', `${watch.toLocaleString()} videos, posts or stories with exact times${ev.some((e) => e.kind === 'watch' && e.title) ? ' and captions' : ''}`, watch);
    const likes = n('like') + n('save'); if (likes) add('What you liked & saved', `${likes.toLocaleString()} likes and saves`, likes);
    const srch = n('search'); if (srch) add('Searches', `${srch.toLocaleString()} things you typed into search`, srch);
    const off = ev.filter((e) => e.kind === 'off_platform').length; if (off) add('Activity outside the app', `${off.toLocaleString()} events reported by other apps and sites`, off, true);
    const visits = ev.filter((e) => e.kind === 'visit').length; if (visits) add('Websites you opened', `${visits.toLocaleString()} pages opened inside the app's browser`, visits);
    const ads = n('ad_view') + n('ad_click'); if (ads) add('Ads shown to you', `${ads.toLocaleString()} ads seen or clicked`, ads);
    const cats = cl(s, /^(ad_category|ai_interest|ad_interest|topic)$/); if (cats.length) add('Labels about you', `${cats.length} interest and audience labels it assigned you`, cats.length);
    if (items.length) holdings.push({ source: s, items });
  }
  // advertisers with your contact info
  const adv = claims.filter((c) => c.field === 'advertiser_audience'); const uniq = new Map<string, Claim>(); for (const a of adv) if (!uniq.has(a.value)) uniq.set(a.value, a);
  const ind: Record<string, string[]> = {}; for (const name of uniq.keys()) (ind[industryOf(name)] ??= []).push(name);
  const industries = Object.entries(ind).map(([name, xs]) => ({ name, n: xs.length, examples: xs.slice(0, 6) })).sort((a, b) => (a.name.startsWith('Other') ? 1 : 0) - (b.name.startsWith('Other') ? 1 : 0) || b.n - a.n);
  const advertisers = { total: uniq.size, uploaded: [...uniq.values()].filter((c) => c.meta?.uploaded_list).length, viaInteraction: [...uniq.values()].filter((c) => c.meta?.remarketing).length, industries, sample: [...uniq.keys()].slice(0, 30), names: [...uniq.keys()] };
  // partners reporting on you
  const pm = new Map<string, Partner & { ts: number[] }>();
  for (const e of events) if (e.kind === 'off_platform' && e.actor) { const k = `${e.source}|${e.actor}`; const p = pm.get(k) ?? { name: e.actor.split(':')[0].trim(), to: cap(e.source === 'instagram' ? 'meta' : e.source), events: 0, types: [], first: '', last: '', named: !/^partner app #/i.test(e.actor), ts: [] }; p.events++; if (e.title && !p.types.includes(e.title) && p.types.length < 6) p.types.push(e.title); p.ts.push(e.ts); pm.set(k, p); }
  const partners = [...pm.values()].map(({ ts, ...p }) => ({ ...p, first: day(Math.min(...ts)), last: day(Math.max(...ts)) })).sort((a, b) => Number(b.named) - Number(a.named) || b.events - a.events);
  // ads you clicked
  const cm = new Map<string, Clicked>(); for (const e of events) if (e.kind === 'ad_click') { const h = hostOf(e.url); const bad = /tiktokv|facebook\.com|instagram\.com|fb\.me/; const who = (e.actor && !bad.test(e.actor) ? e.actor : '') || (h && !bad.test(h) ? h : '') || (e.title && !/^n\/a$/i.test(e.title) ? e.title.split(/[|:–-]/)[0].trim() : '') || 'unknown advertiser'; const k = `${e.source}|${who}`; const c = cm.get(k) ?? { advertiser: who, platform: cap(e.source), n: 0, last: '', title: e.title }; c.n++; c.last = day(Math.max(Date.parse(c.last || '1970-01-01'), e.ts)); cm.set(k, c); }
  const clicked = [...cm.values()].sort((a, b) => b.n - a.n);
  // sites opened in in-app browsers
  const sm: Record<string, number> = {}; for (const e of events) if (e.kind === 'visit' && e.meta?.via === 'in-app-browser') { const h = hostOf(e.url); if (h) sm[h] = (sm[h] ?? 0) + 1; }
  const sites = Object.entries(sm).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([domain, n]) => ({ domain, n }));
  // what you handed over
  const youGave: Flows['youGave'] = [];
  for (const c of claims.filter((c) => c.field === 'synced_contacts_count' && Number(c.value))) youGave.push({ what: `${Number(c.value).toLocaleString()} contacts → ${cap(c.source === 'instagram' ? 'meta' : c.source)}`, detail: 'Names and numbers of people in your phone, used for “People you may know” and to match ads to them too.' });
  for (const c of claims.filter((c) => c.field === 'autofill_on_file')) youGave.push({ what: `Autofill (${c.value}) → ${cap(c.source === 'instagram' ? 'meta' : c.source)}`, detail: 'Saved for checkout forms inside the app.' });
  for (const c of claims.filter((c) => c.field === 'payment_method_on_file')) youGave.push({ what: `Payment method → ${cap(c.source === 'instagram' ? 'meta' : c.source)}`, detail: 'A card or wallet is on file for in-app checkout.' });
  const sub = claims.filter((c) => c.field === 'submitted_to_advertiser'); if (sub.length) youGave.push({ what: `${sub.length} lead form${sub.length > 1 ? 's' : ''} → advertisers`, detail: `You filled in a form inside an Instagram ad${sub.some((c) => c.value !== 'lead form') ? ` (${[...new Set(sub.map((c) => c.value))].slice(0, 3).join(', ')})` : ''}. The advertiser received your answers directly.` });
  const partnerTotal = partners.length;
  const headline = advertisers.total ? `${advertisers.total.toLocaleString()} companies have your contact info, and ${partnerTotal} apps report what you do.` : partnerTotal ? `${partnerTotal} apps report what you do to the platforms you use.` : 'Add an export to see who holds your data.';
  return { holdings, advertisers, partners, partnerTotal, clicked, sites, youGave, headline };
}

/* ───────────────────────── WHAT YOUR HISTORY SAYS ───────────────────────── */

export interface Statement { id: string; title: string; body: string; evidence: string[]; source: string; strength: 'strong' | 'medium' | 'weak' }

export function buildPortrait(events: Event[], claims: Claim[], tz: string): Statement[] {
  const out: Statement[] = [];
  const C = (f: string | RegExp) => claims.filter((c) => (typeof f === 'string' ? c.field === f : f.test(c.field)));
  // 1. Meta's own read of you
  const cats = C('ad_category').map((c) => c.value);
  if (cats.length) {
    const life = cats.filter((c) => /away from|family|hometown|relationship|engaged|married|single|parent|new job|moved|anniversary|birthday|expat|lived in/i.test(c));
    const tech = cats.filter((c) => /access|device|browser|iphone|ios|android|network|wi-?fi|4g|5g|operating/i.test(c));
    const behaviour = cats.filter((c) => !life.includes(c) && !tech.includes(c));
    out.push({ id: 'meta-segments', title: 'How Meta sells you to advertisers', body: `Meta put you in ${cats.length} audience groups. ${life.length ? `Life situation: ${life.slice(0, 4).join(', ').toLowerCase()}. ` : ''}${behaviour.length ? `Behaviour: ${behaviour.slice(0, 4).join(', ').toLowerCase()}.` : ''}`, evidence: cats.slice(0, 12), source: 'Instagram · other_categories_used_to_reach_you', strength: 'strong' });
  }
  const ai = C('ai_interest').map((c) => c.value);
  if (ai.length) out.push({ id: 'meta-ai', title: 'What Meta’s AI wrote about you', body: `Meta keeps ${ai.length} plain-English notes on what “the user might be interested in”. These steer Reels, suggestions and ads.`, evidence: ai.slice(0, 10), source: 'Instagram · ai/interest_categories', strength: 'strong' });
  // 2. What you actually consume (captions, owners, hashtags)
  const content = events.filter((e) => ['watch', 'like', 'save'].includes(e.kind) && (e.title || e.meta?.tags));
  if (content.length > 50) {
    const t: Record<string, number> = {}; for (const e of content) { const { topic } = classifyEvent(e); if (topic !== 'Other') t[topic] = (t[topic] ?? 0) + 1; }
    const total = Object.values(t).reduce((a, b) => a + b, 0) || 1; const top = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const tags: Record<string, number> = {}; for (const e of content) for (const tg of String(e.meta?.tags ?? '').split(' ').filter(Boolean)) tags[tg.toLowerCase()] = (tags[tg.toLowerCase()] ?? 0) + 1;
    const topTags = Object.entries(tags).filter(([k]) => !GENERIC_TAGS.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => '#' + k);
    if (top.length) out.push({ id: 'content', title: `Your feed is mostly ${top[0][0].toLowerCase()}`, body: `Of ${content.length.toLocaleString()} things you watched, liked or saved that carry a caption, the biggest themes are ${top.map(([k, v]) => `${k.toLowerCase()} (${Math.round((v / total) * 100)}%)`).join(', ')}.`, evidence: topTags.length ? topTags : top.map(([k]) => k), source: 'captions & hashtags of watched, liked and saved posts', strength: content.length > 500 ? 'strong' : 'medium' });
    const acc: Record<string, number> = {}; for (const e of content) if (e.actor) acc[e.actor] = (acc[e.actor] ?? 0) + 1;
    const topAcc = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (topAcc.length >= 3) out.push({ id: 'accounts', title: 'The accounts that shape your feed', body: `${topAcc.slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ')} show up most in what you watch and like. The algorithm treats these as your anchors.`, evidence: topAcc.map(([k, v]) => `${k} · ${v}`), source: 'owners of watched, liked and saved posts', strength: 'medium' });
  }
  const rejected = events.filter((e) => e.meta?.what === 'not_interested');
  if (rejected.length > 10) { const t: Record<string, number> = {}; for (const e of rejected) { const { topic } = classifyEvent(e); if (topic !== 'Other') t[topic] = (t[topic] ?? 0) + 1; } const top = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 4);
    out.push({ id: 'rejected', title: 'What you keep pushing away', body: `${rejected.length.toLocaleString()} posts are logged as “not interested”${top.length ? `, mostly ${top.map(([k]) => k.toLowerCase()).join(', ')}` : ''}. Meta records the rejection, and it still shapes your profile.`, evidence: [...new Set(rejected.map((e) => e.actor).filter((a): a is string => !!a && /^[\w.]{3,30}$/.test(a) && !/^media$/i.test(a)))].slice(0, 6).map((a) => '@' + a), source: "posts_you're_not_interested_in", strength: 'medium' }); }
  // 3. Searches
  const searches = events.filter((e) => e.kind === 'search' && e.title);
  if (searches.length >= 5) { const t: Record<string, string[]> = {}; for (const e of searches) { const { topic } = classifyEvent(e); (t[topic === 'Other' ? 'Other' : topic] ??= []).push(e.title!); }
    const themes = Object.entries(t).filter(([k]) => k !== 'Other').sort((a, b) => b[1].length - a[1].length).slice(0, 4);
    const recent = searches.slice(-6).reverse().map((e) => `“${e.title}”`);
    out.push({ id: 'searches', title: 'What you went looking for', body: `${searches.length.toLocaleString()} searches${themes.length ? `, clustered around ${themes.map(([k, v]) => `${k.toLowerCase()} (${v.length})`).join(', ')}` : ''}. Searches are the strongest signal you give: they show intent, not just interest.`, evidence: recent, source: 'search history', strength: 'strong' }); }
  // 4. Rhythm
  const act = events.filter((e) => ['watch', 'like', 'save', 'message', 'search', 'comment', 'play'].includes(e.kind));
  if (act.length > 200) { let late = 0; const nights = new Set<string>(); for (const e of act) { const p = localParts(e.ts, tz); if (p.hour >= 0 && p.hour < 4) { late++; nights.add(`${p.y}-${p.m}-${p.d}`); } }
    const days = new Set(act.map((e) => { const p = localParts(e.ts, tz); return `${p.y}-${p.m}-${p.d}`; })).size; const share = late / act.length;
    out.push({ id: 'rhythm', title: share > 0.25 ? 'You’re most online after midnight' : share > 0.12 ? 'You often stay up scrolling' : 'Your phone use is mostly daytime', body: `${Math.round(share * 100)}% of your activity happens between midnight and 4 am, on ${nights.size} of ${days} active days. Late-night is when ad systems rate people as most persuadable.`, evidence: [`${nights.size} late nights`, `${days} active days`], source: 'timestamps on watches, likes, messages, searches', strength: 'strong' }); }
  // 5. Social circle
  const msgs = events.filter((e) => e.kind === 'message' && !e.meta?.request);
  if (msgs.length > 100) { const th: Record<string, number> = {}; for (const m of msgs) if (m.title) th[m.title] = (th[m.title] ?? 0) + 1; const top = Object.entries(th).sort((a, b) => b[1] - a[1]); const top5 = top.slice(0, 5).reduce((n, [, v]) => n + v, 0);
    const span = (Math.max(...msgs.map((m) => m.ts)) - Math.min(...msgs.map((m) => m.ts))) / 86400000;
    out.push({ id: 'social', title: `${top.length} conversations, ${Math.round((top5 / msgs.length) * 100)}% with just five`, body: `${msgs.length.toLocaleString()} messages over ${Math.round(span / 30)} months. Your inner circle is small and active; the platform knows exactly who it is and when you talk.`, evidence: top.slice(0, 5).map(([k, v]) => `${k} · ${v.toLocaleString()}`), source: 'message metadata (never content)', strength: 'strong' }); }
  const close = C('close_friends_count')[0], hide = C('hide_story_from_count')[0], unf = C('recently_unfollowed_count')[0], removed = C('removed_suggestions_count')[0];
  if (hide || close || unf) out.push({ id: 'boundaries', title: 'Who you keep at a distance', body: [hide && `You hide your stories from ${hide.value} people`, close && `have ${close.value} close friends`, unf && `recently unfollowed ${unf.value}`, removed && `and dismissed ${removed.value} “suggested for you” accounts`].filter(Boolean).join(', ') + '. All of it is logged.', evidence: [], source: 'connections', strength: 'medium' });
  // 6. Places
  const based = C('profile_based_in')[0]; const loi = C('location_of_interest').map((c) => c.value); const gps = C('last_known_location');
  if (based || loi.length || gps.length) out.push({ id: 'places', title: based ? `They place you in ${based.value}` : 'They know where you go', body: `${loi.length ? `${loi.length} “locations of interest”: ${loi.slice(0, 5).join(', ')}. ` : ''}${gps.length ? `${gps.map((g) => `${cap(g.source)} has a recent GPS fix near ${(g.value.split('·').pop() ?? '').trim().replace(/^[A-Z]{2}\((.+)\)$/, '$1')}`).join('; ')}.` : ''}`, evidence: loi.slice(0, 8), source: 'profile_based_in, locations_of_interest, last known location', strength: 'strong' });
  // 7. Dating signal, shopping intent
  const dating = events.filter((e) => e.kind === 'off_platform' && /tinder|hinge|bumble|grindr|raya|okcupid|match/i.test(e.actor ?? ''));
  if (dating.length) out.push({ id: 'dating', title: 'Dating apps report on you', body: `${[...new Set(dating.map((e) => (e.actor ?? '').split(':')[0]))].join(', ')} sent ${dating.length} of your sessions to ${[...new Set(dating.map((e) => cap(e.source)))].join(' and ')}. That's enough for “single” targeting.`, evidence: [...new Set(dating.map((e) => e.title ?? ''))].slice(0, 4), source: 'off-platform activity', strength: 'medium' });
  const clicks = events.filter((e) => e.kind === 'ad_click');
  if (clicks.length) out.push({ id: 'clicks', title: `You clicked ${clicks.length} ads`, body: `Each click sent a tracking ID to the advertiser, linking that visit back to you. ${[...new Set(clicks.map((e) => e.actor || hostOf(e.url)).filter((h) => h && !/tiktokv|facebook\.com|instagram\.com/.test(h)))].slice(0, 4).join(', ')}.`, evidence: clicks.map((e) => (e.title ?? '').slice(0, 50)).filter((t) => t && !/^n\/a$/i.test(t)).slice(0, 4), source: 'ad clicks', strength: 'medium' });
  return out;
}

/* ───────────────────────── HABITS (readable attention) ───────────────────────── */

export interface Habits {
  hoursTotal: number; days: number; hoursPerDay: number;
  perSource: { source: string; hours: number; items: number }[];
  typicalDay: { hour: number; perDay: number }[];          // average items per active day at each hour
  sessions: { count: number; perDay: number; avgMin: number; longestMin: number; longestWhen: string; lateNightsPerWeek: number };
  weekly: { week: string; bySource: Record<string, number> }[]; // last 26 weeks
  chosen: { liked: number; consumed: number; rate: number };
  takeaways: string[];
  enoughForMood: boolean;
}

export function buildHabits(events: Event[], tz: string): Habits {
  const CONS = new Set(['watch', 'play']); const ENG = new Set(['like', 'save', 'share', 'comment']);
  const cons = events.filter((e) => CONS.has(e.kind) && e.meta?.what !== 'suggested_account' && ['instagram', 'tiktok', 'youtube', 'spotify', 'apple', 'x', 'snapchat'].includes(e.source));
  const dayKey = (ts: number) => { const p = localParts(ts, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
  const days = new Set(cons.map((e) => dayKey(e.ts))).size || 1;
  // sessions per source, gap 20 min; each item ≥ 25 s
  const bySrc: Record<string, number[]> = {}; for (const e of cons) (bySrc[e.source] ??= []).push(e.ts);
  type S = { src: string; start: number; end: number; n: number };
  const sess: S[] = [];
  for (const [src, arr] of Object.entries(bySrc)) { arr.sort((a, b) => a - b); let s: S | null = null; for (const t of arr) { if (!s || t - s.end > 20 * 60000) { if (s) sess.push(s); s = { src, start: t, end: t, n: 1 }; } else { s.end = t; s.n++; } } if (s) sess.push(s); }
  const dur = (s: S) => Math.max(s.end - s.start, s.n * 25000);
  const perSource = Object.keys(bySrc).map((src) => ({ source: src, hours: sess.filter((s) => s.src === src).reduce((n, s) => n + dur(s), 0) / 3600000, items: bySrc[src].length })).sort((a, b) => b.hours - a.hours);
  const hoursTotal = perSource.reduce((n, p) => n + p.hours, 0);
  const hourCounts = Array(24).fill(0); for (const e of cons) hourCounts[localParts(e.ts, tz).hour]++;
  const typicalDay = hourCounts.map((n, hour) => ({ hour, perDay: n / days }));
  const longest = sess.slice().sort((a, b) => dur(b) - dur(a))[0];
  const late = new Set(sess.filter((s) => { const p = localParts(s.end, tz); return p.hour >= 1 && p.hour < 5; }).map((s) => dayKey(s.end))).size;
  const spanDays = cons.length ? (Math.max(...cons.map((e) => e.ts)) - Math.min(...cons.map((e) => e.ts))) / 86400000 : 1;
  const sessions = { count: sess.length, perDay: sess.length / days, avgMin: sess.length ? sess.reduce((n, s) => n + dur(s), 0) / sess.length / 60000 : 0, longestMin: longest ? dur(longest) / 60000 : 0, longestWhen: longest ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(longest.start)) + ` · ${cap(longest.src)}` : '', lateNightsPerWeek: late / Math.max(1, days / 7) };
  // weekly trend, last 26 weeks
  const last = cons.length ? Math.max(...cons.map((e) => e.ts)) : Date.now(); const W = 7 * 86400000; const start = last - 26 * W;
  const weekly = Array.from({ length: 26 }, (_, i) => ({ week: new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(start + i * W)), bySource: {} as Record<string, number> }));
  for (const e of cons) if (e.ts >= start) { const i = Math.min(25, Math.floor((e.ts - start) / W)); weekly[i].bySource[e.source] = (weekly[i].bySource[e.source] ?? 0) + 1; }
  // only count likes inside the same window as each app's watch history, or old likes inflate the ratio
  const win: Record<string, [number, number]> = {}; for (const e of cons) { const w = (win[e.source] ??= [e.ts, e.ts]); if (e.ts < w[0]) w[0] = e.ts; if (e.ts > w[1]) w[1] = e.ts; }
  const liked = events.filter((e) => ENG.has(e.kind) && win[e.source] && e.ts >= win[e.source][0] && e.ts <= win[e.source][1]).length;
  const peakH = hourCounts.indexOf(Math.max(...hourCounts)); const quiet = hourCounts.map((n, h) => [n, h]).filter(([n]) => n <= Math.max(...hourCounts) * 0.05).map(([, h]) => h);
  const takeaways: string[] = [];
  if (hoursTotal) takeaways.push(`About ${fmtH(hoursTotal / days)} a day across ${perSource.length} app${perSource.length > 1 ? 's' : ''}, on the days you use them.`);
  takeaways.push(`Your busiest hour is ${hr(peakH)}.${quiet.length ? ` You're almost never on between ${hr(quiet[0])} and ${hr((quiet[quiet.length - 1] + 1) % 24)}.` : ''}`);
  if (sessions.count) takeaways.push(`${sessions.perDay.toFixed(1)} sessions a day, ${Math.round(sessions.avgMin)} minutes on average. Longest: ${Math.round(sessions.longestMin)} minutes.`);
  if (sessions.lateNightsPerWeek >= 0.5) takeaways.push(`You're still scrolling after 1 am about ${sessions.lateNightsPerWeek.toFixed(1)} nights a week.`);
  const labelled = cons.filter((e) => classifyEvent(e).mood !== 'Neutral').length;
  return { hoursTotal, days, hoursPerDay: hoursTotal / days, perSource, typicalDay, sessions, weekly, chosen: { liked, consumed: cons.length, rate: cons.length ? liked / cons.length : 0 }, takeaways, enoughForMood: labelled >= 300 };
}

function hostOf(u?: string) { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } }
function day(ts: number) { return new Date(ts).toISOString().slice(0, 10); }
function fmtH(h: number) { return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`; }
export function hr(h: number) { return h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`; }
export type { Source };

const GENERIC_TAGS = /^(reels?|fyp|foryou|foryoupage|fypシ|explore|explorepage|viral|viralvideos?|trending|trend|instagram|instagood|instadaily|reelsinstagram|reelitfeelit|reelsviral|explorer|tiktok|video|videos|love|like|likes|follow|followme|photooftheday|share|new|repost)$/i;
