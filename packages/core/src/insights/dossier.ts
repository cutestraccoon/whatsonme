import type { Claim, Event } from '../types.js';
import { classify, classifyEvent } from './lexicon.js';
import { localParts, cap, pad } from './attention.js';

export interface DossierRow { field: string; value: string; src: string; conf: 'HIGH' | 'MED' | 'LOW'; why: string; used: string; file: string }
export interface Flag { src: string; sev: 'HIGH VALUE' | 'MED' | 'INFO'; flag: string; means: string; trigger: string; buyers: string; file: string }
export interface Place { label: string; lat: number; lon: number; hours: number; nights: number; file: string }
export interface Routine { home?: Place; work?: Place; secondBase?: Place; transport?: { mode: string; prob: number; trips: number; file: string }; weekGrid: string[][]; pings: number; placesLabelled: number; wifi?: number; facts: { k: string; v: string; note: string }[] }

const SRC = (c: Claim) => cap(c.source);

/** Build inferred-attribute rows ONLY from what the data supports. Each row carries evidence + receipt. */
export function buildDossier(events: Event[], claims: Claim[], tz: string): DossierRow[] {
  const rows: DossierRow[] = [];
  const by = (f: string | RegExp) => claims.filter((c) => (typeof f === 'string' ? c.field === f : f.test(c.field)));
  // Age
  const age = by('inferred_age')[0]; const bday = by(/declared_(date_of_birth|birthday|birthdate)/)[0];
  if (age) rows.push({ field: 'AGE', value: age.value, src: SRC(age), conf: 'HIGH', why: `${SRC(age)} ships an inferred age bracket in its personalization data, built from who you follow and what you linger on.`, used: 'Age-gates alcohol, gambling and dating ads; selects “life stage” campaigns (first home, first car, wedding).', file: age.file });
  else if (bday) { const band = ageBand(bday.value); if (band) rows.push({ field: 'AGE', value: band, src: SRC(bday), conf: 'HIGH', why: `Your exact birthdate is on file at ${SRC(bday)} (declared at sign-up). Advertisers get it as an age bracket; we show the bracket too, so it never lands on a screenshot.`, used: 'Age-gates alcohol, gambling and dating ads; selects “life stage” campaigns (first home, first car, wedding).', file: bday.file }); }
  // Gender
  const g = by(/inferred_gender|declared_gender/)[0];
  if (g) rows.push({ field: 'GENDER', value: g.value, src: SRC(g), conf: g.field.startsWith('inferred') ? 'MED' : 'HIGH', why: g.field.startsWith('inferred') ? `${SRC(g)} inferred it from your activity; you never declared it there.` : 'Declared in profile settings.', used: 'Splits ad creative and prices some finance and insurance leads differently.', file: g.file });
  // Location (home/work)
  const home = by(/inferred_home/)[0]; const based = by('profile_based_in')[0];
  if (home) rows.push({ field: 'HOME', value: coarse(home.value), src: SRC(home), conf: (home.confidence ?? 0) > 0.8 ? 'HIGH' : 'MED', why: `Google labelled a place “Home” from where the phone sits overnight${home.confidence ? ` (probability ${Math.round(home.confidence * 100)}%)` : ''}. You never saved it.`, used: 'Postal area feeds income estimates, local-service ads and “new mover” detection.', file: home.file });
  else if (based) rows.push({ field: 'HOME CITY', value: based.value, src: SRC(based), conf: 'MED', why: 'Meta infers the city your profile is “based in” from login IPs and tagged locations.', used: 'Local ads, city-level audience segments.', file: based.file });
  const work = by(/inferred_work/)[0];
  if (work) rows.push({ field: 'WORK', value: coarse(work.value), src: SRC(work), conf: 'MED', why: 'Labelled “Work” from weekday 9–5 dwell.', used: 'Commute length and car ownership inferences; B2B targeting.', file: work.file });
  // Carrier / device
  const carrier = by('carrier')[0]; const device = by('device')[0] ?? by(/setting_device_model/)[0];
  if (carrier || device) rows.push({ field: 'DEVICE', value: [device?.value, carrier?.value].filter(Boolean).join(' · '), src: [device && SRC(device), carrier && SRC(carrier)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' + '), conf: 'HIGH', why: 'Reported automatically on every login by the app itself.', used: 'Device tier is an income proxy; carrier enables competitor “switch” offers.', file: (device ?? carrier)!.file });
  // Employment / business
  const biz = claims.find((c) => /small business|entrepreneur|business owner/i.test(c.value) && /ad_interest|topic/.test(c.field));
  if (biz) rows.push({ field: 'EMPLOYMENT', value: 'Small business / self-employed', src: SRC(biz), conf: 'MED', why: `“${biz.value}” appears in your ${biz.field === 'topic' ? 'topics' : 'ad interests'}.`, used: 'Loans, payroll, accounting software, business cards. One of the priciest segments.', file: biz.file });
  // Relationship
  const dating = claims.find((c) => c.field === 'advertiser_audience' && /tinder|hinge|bumble|match\.com|okcupid/i.test(c.value)) ?? events.find((e) => e.kind === 'off_platform' && /tinder|hinge|bumble/i.test(e.actor ?? ''));
  if (dating) { const plat = SRC({ source: dating.source } as Claim); const app = 'field' in dating ? dating.value : (dating.actor ?? 'A dating app').split(':')[0]; const n = 'field' in dating ? 0 : events.filter((e) => e.kind === 'off_platform' && e.actor === dating.actor).length;
    rows.push({ field: 'RELATIONSHIP', value: 'Single (guessed)', src: plat, conf: 'LOW', why: 'field' in dating ? `${app} uploaded your contact info to ${plat} to target you.` : `${app} reported ${n} of your sessions (logins, app opens) to ${plat}. A dating-app user is the signal; it's a guess, not a fact.`, used: 'Dating, grooming, fitness and solo-travel campaigns.', file: dating.file }); }
  // Homeownership / moving
  const re = events.filter((e) => (e.kind === 'search' || e.kind === 'watch') && classifyEvent(e).topic === 'Real estate & property');
  if (re.length >= 15) rows.push({ field: 'HOUSING', value: re.some((e) => /mortgage|pre-?construction|down ?payment/i.test(e.title ?? '')) ? 'Renter · likely to buy' : 'Likely to move', src: 'Derived', conf: re.length > 50 ? 'MED' : 'LOW', why: `${re.length} real-estate searches and views${re[0] ? `, e.g. “${re[0].title}”` : ''}. This is exactly what Meta's “Likely to move” segment keys on.`, used: 'Realtors, movers, telecoms, furniture, home insurance.', file: re[0].file });
  // Income proxy (only if strong signals)
  const lux = events.filter((e) => classifyEvent(e).topic === 'Luxury & watches').length; const travel = events.filter((e) => classifyEvent(e).topic === 'Travel').length;
  const incomeClaim = by(/ad_demographic_.*income/)[0];
  if (incomeClaim) rows.push({ field: 'HOUSEHOLD INCOME', value: incomeClaim.value, src: SRC(incomeClaim), conf: 'MED', why: 'Google Ad Center bracket, inferred from postal area, device, and what you shop for.', used: 'Whether premium finance and high-ticket ads bid on you at all.', file: incomeClaim.file });
  else if (lux + travel > 40) rows.push({ field: 'SPEND TIER', value: 'Premium (derived)', src: 'Derived', conf: 'LOW', why: `${lux} luxury and ${travel} travel items. Platforms map this to a high-income bracket whether or not it's true.`, used: 'Luxury, premium credit cards, first-class travel.', file: events.find((e) => classifyEvent(e).topic === 'Luxury & watches')?.file ?? '' });
  // Parent
  const kid = events.filter((e) => /\b(daycare|kindergarten|stroller|baby|toddler|parenting|school)\b/i.test(e.title ?? '')).length;
  const titled = events.reduce((n, e) => n + ((e.kind === 'search' || e.kind === 'watch') && e.title ? 1 : 0), 0);
  // "Not a parent" is only a supportable negative when there is a real body of searches/watches to be silent.
  if (kid > 10 || titled >= 100) rows.push({ field: 'PARENTAL STATUS', value: kid > 10 ? 'Parent (guessed)' : 'Not a parent (guessed)', src: 'Derived', conf: 'LOW', why: kid > 10 ? `${kid} child-related searches and views.` : 'No searches for schools, daycare or children’s products.', used: kid > 10 ? 'Family products, education, minivans.' : 'Removes you from family campaigns; adds you to discretionary-spend ones (travel, tech, nightlife).', file: events[0]?.file ?? '' });
  // Night owl
  const night = events.filter((e) => ['watch', 'play', 'like'].includes(e.kind)); const late = night.filter((e) => { const h = localParts(e.ts, tz).hour; return h >= 23 || h < 2; }).length;
  if (night.length > 50) rows.push({ field: 'CHRONOTYPE', value: late / night.length > 0.3 ? 'Night owl' : late / night.length > 0.15 ? 'Late evening' : 'Daytime', src: 'Derived', conf: 'HIGH', why: `${Math.round((late / night.length) * 100)}% of your watches and likes fall between 23:00 and 02:00.`, used: 'Ad delivery is time-shifted to when you resist least. Late-night slots carry higher conversion rates.', file: night[0].file });
  return rows;
}

export function buildFlags(events: Event[], claims: Claim[], tz = 'UTC'): Flag[] {
  const out: Flag[] = [];
  const re = events.filter((e) => classifyEvent(e).topic === 'Real estate & property').length;
  if (re >= 15) out.push({ src: 'META SEGMENT (reconstructed)', sev: 'HIGH VALUE', flag: 'Likely to move', means: 'Predicted change of address within ~90 days.', trigger: `${re} property searches/views; condo and mortgage content.`, buyers: 'Realtors, movers, telecoms, furniture, home insurance.', file: events.find((e) => classifyEvent(e).topic === 'Real estate & property')?.file ?? '' });
  const biz = claims.find((c) => /small business|entrepreneur/i.test(c.value)); if (biz) out.push({ src: cap(biz.source).toUpperCase() + ' INTEREST', sev: 'HIGH VALUE', flag: 'Small business owner', means: 'You run or administer a business presence.', trigger: `“${biz.value}” in your ad interests.`, buyers: 'Lenders, payroll, accounting software, business credit cards.', file: biz.file });
  const tech = events.filter((e) => classifyEvent(e).topic === 'AI & tech').length; if (tech > 40) out.push({ src: 'GOOGLE AFFINITY (reconstructed)', sev: 'MED', flag: 'Technophile / early adopter', means: 'Tries new tech before most people.', trigger: `${tech} AI, hardware and coding items.`, buyers: 'Gadget launches, SaaS trials, crypto exchanges.', file: events.find((e) => classifyEvent(e).topic === 'AI & tech')?.file ?? '' });
  const adClicks = events.filter((e) => e.kind === 'ad_click').length; const shop = events.filter((e) => classifyEvent(e).topic === 'Shopping & deals').length; if (adClicks + shop > 20) out.push({ src: 'META BEHAVIOUR', sev: 'MED', flag: 'Engaged shopper', means: 'Clicks “Shop now” more than most in the last week.', trigger: `${adClicks} ad clicks and ${shop} shopping views.`, buyers: 'Any DTC brand running conversion campaigns. Raises your ad load.', file: events.find((e) => e.kind === 'ad_click')?.file ?? '' });
  const ips = claims.find((c) => c.field === 'unique_ips'); const logins = events.filter((e) => e.kind === 'login'); const ipSet = new Set(logins.map((e) => String(e.meta?.ip ?? '')).filter(Boolean));
  if ((ips && Number(ips.value) > 15) || ipSet.size > 15) out.push({ src: 'LOGIN HISTORY', sev: 'INFO', flag: 'Frequent traveller', means: 'Regular logins from outside your home region.', trigger: `${ips?.value ?? ipSet.size} distinct IP addresses across your logins.`, buyers: 'Airlines, hotels, roaming add-ons, travel insurance.', file: ips?.file ?? logins[0]?.file ?? '' });
  const dev = claims.find((c) => c.field === 'device'); const car = claims.find((c) => c.field === 'carrier'); if (dev || car) out.push({ src: 'DEVICE TELEMETRY', sev: 'INFO', flag: `Owns: ${dev?.value ?? 'phone'}${car ? ` · Network: ${car.value}` : ''}`, means: 'Handset and carrier known from app telemetry.', trigger: 'Automatic. Every session reports device model and carrier.', buyers: 'Competing carriers, accessory makers, trade-in programs.', file: (dev ?? car)!.file });
  const night = events.filter((e) => e.kind === 'watch'); if (night.length > 100) { const late = night.filter((e) => { const h = localParts(e.ts, tz).hour; return h >= 0 && h < 4; }).length; if (late / night.length > 0.25) out.push({ src: 'DELIVERY MODEL', sev: 'MED', flag: 'Late-night high receptivity', means: 'Platforms rank you as more persuadable after midnight.', trigger: `${Math.round((late / night.length) * 100)}% of watches after midnight.`, buyers: 'Impulse-purchase DTC, gambling, food delivery.', file: night[0].file }); }
  return out;
}

export function buildRoutine(events: Event[], claims: Claim[], tz: string): Routine {
  const locs = events.filter((e) => e.kind === 'location' && e.lat != null && e.lon != null);
  const trips = events.filter((e) => e.kind === 'trip');
  // cluster by rounded coords (~1km)
  const cl: Record<string, { lat: number; lon: number; n: number; hours: number; nights: number; days: number; files: Set<string>; labels: Record<string, number> }> = {};
  for (const l of locs) { const k = `${l.lat!.toFixed(2)},${l.lon!.toFixed(2)}`; const c = (cl[k] ??= { lat: l.lat!, lon: l.lon!, n: 0, hours: 0, nights: 0, days: 0, files: new Set(), labels: {} }); c.n++; c.files.add(l.file); const { hour, day } = localParts(l.ts, tz); const dur = (l.value ?? 3600000) / 3600000; c.hours += dur; if (hour >= 23 || hour < 6) c.nights += dur; if (day < 5 && hour >= 9 && hour < 17) c.days += dur; const lab = String(l.meta?.semantic ?? ''); if (lab) c.labels[lab] = (c.labels[lab] ?? 0) + 1; }
  const arr = Object.values(cl).sort((a, b) => b.hours - a.hours);
  const mk = (c: typeof arr[0] | undefined, label: string): Place | undefined => c && { label, lat: c.lat, lon: c.lon, hours: Math.round(c.hours), nights: Math.round(c.nights), file: [...c.files][0] };
  // Fallbacks need actual overnight / weekday-daytime dwell; otherwise a single lunch ping becomes "Home".
  const home = mk(arr.find((c) => /HOME/i.test(Object.keys(c.labels).join())) ?? arr.filter((c) => c.nights >= 8).sort((a, b) => b.nights - a.nights)[0], 'Home (inferred)');
  const work = mk(arr.filter((c) => c !== (home && cl[`${home.lat.toFixed(2)},${home.lon.toFixed(2)}`])).find((c) => /WORK/i.test(Object.keys(c.labels).join())) ?? arr.filter((c) => (!home || dist(c, home) > 1) && c.days >= 8).sort((a, b) => b.days - a.days)[0], 'Work (inferred)');
  const far = arr.filter((c) => home && dist(c, home) > 80).sort((a, b) => b.hours - a.hours)[0]; const secondBase = far ? mk(far, `Second base · ${Math.round(dist(far, home!))} km away`) : undefined;
  // transport
  const modes: Record<string, { n: number; prob: number; file: string }> = {}; for (const t of trips) { const m = String(t.title ?? 'UNKNOWN'); const s = (modes[m] ??= { n: 0, prob: 0, file: t.file }); s.n++; let pr = Number(t.meta?.prob); if (!Number.isFinite(pr) || pr <= 0) pr = t.meta?.confidence === 'HIGH' ? 0.9 : t.meta?.confidence === 'MEDIUM' ? 0.6 : 0.4; if (pr > 1) pr = pr / 100; s.prob += Math.min(1, pr); }
  const top = Object.entries(modes).sort((a, b) => b[1].n - a[1].n)[0];
  const transport = top ? { mode: top[0], prob: top[1].n ? top[1].prob / top[1].n : 0, trips: top[1].n, file: top[1].file } : undefined;
  // week grid: label per hour from where the phone was
  const weekGrid: string[][] = Array.from({ length: 7 }, () => Array(24).fill('No signal'));
  const counts: Record<string, Record<string, number>> = {};
  for (const l of locs) { const { day, hour } = localParts(l.ts, tz); const lab = home && dist({ lat: l.lat!, lon: l.lon! }, home) < 1 ? 'Home' : work && dist({ lat: l.lat!, lon: l.lon! }, work) < 1 ? 'Work' : secondBase && dist({ lat: l.lat!, lon: l.lon! }, secondBase) < 5 ? 'Away' : 'Out'; const k = `${day}-${hour}`; (counts[k] ??= {})[lab] = (counts[k]?.[lab] ?? 0) + 1; }
  for (const t of trips) { const { day, hour } = localParts(t.ts, tz); const k = `${day}-${hour}`; (counts[k] ??= {})['Transit'] = (counts[k]?.['Transit'] ?? 0) + 0.6; }
  for (const [k, m] of Object.entries(counts)) { const [d, h] = k.split('-').map(Number); weekGrid[d][h] = Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]; }
  const pingsClaim = claims.find((c) => c.field === 'raw_location_pings');
  const facts = [
    home ? { k: 'HOME (INFERRED)', v: `${home.lat.toFixed(3)}, ${home.lon.toFixed(3)}`, note: `Where the phone sits overnight: ~${home.nights} night-hours logged. ${/HOME/.test(Object.keys(cl[`${home.lat.toFixed(2)},${home.lon.toFixed(2)}`]?.labels ?? {}).join()) ? 'Google labelled it “Home” itself.' : 'Derived from overnight dwell.'}` } : { k: 'HOME', v: '—', note: 'No location data yet. Add Google Timeline, Uber or Snapchat.' },
    work ? { k: 'WORK (INFERRED)', v: `${work.lat.toFixed(3)}, ${work.lon.toFixed(3)}`, note: `~${Math.round(cl[`${work.lat.toFixed(2)},${work.lon.toFixed(2)}`]?.days ?? 0)} weekday-daytime hours. Tells advertisers your commute and that you leave home for work.` } : { k: 'WORK', v: '—', note: 'No weekday daytime cluster found.' },
    transport ? { k: 'TRANSPORT MODE', v: `${transport.mode} · ${Math.round(transport.prob * 100)}%`, note: `Google guessed how you moved on ${transport.trips} trips. Feeds car-lease, gas and transit-pass segments.` } : { k: 'TRANSPORT', v: '—', note: 'Needs Google Timeline trips.' },
    secondBase ? { k: 'SECOND BASE', v: secondBase.label, note: `${secondBase.hours} hours logged there. This single pattern creates “Frequent traveller”.` } : { k: 'SECOND BASE', v: 'none found', note: 'No recurring cluster more than 80 km from home.' },
  ];
  return { home, work, secondBase, transport, weekGrid, pings: Number(pingsClaim?.value ?? locs.length), placesLabelled: locs.filter((l) => l.meta?.semantic).length, facts };
}

function dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }) { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
export { pad };

/** Street address -> area only (city/province, or rounded coords). The exact address stays in the receipt file, never on screen. */
function coarse(v: string): string { const ll = v.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/); if (ll) return `${(+ll[1]).toFixed(2)}, ${(+ll[2]).toFixed(2)} (≈1 km)`; const parts = v.split(',').map((x) => x.trim()).filter(Boolean); if (parts.length >= 3) return parts.slice(-3, -1).join(', ') + ' (street hidden)'; if (parts.length === 2) return parts[1] + ' (street hidden)'; return /\d/.test(v) ? 'labelled address (hidden)' : v; }

/** Exact birthdate -> ad-style age band. Never return the date itself. */
function ageBand(v: string): string | null {
  const y = v.match(/\b(19|20)\d{2}\b/)?.[0]; if (!y) return null; const t = Date.parse(v.replace(/(\d{2})-([A-Za-z]{3})-(\d{4})/, '$2 $1 $3')); const born = Number.isFinite(t) ? new Date(t) : new Date(Number(y), 6, 1);
  const age = Math.floor((Date.now() - born.getTime()) / (365.25 * 86400000)); if (age < 13 || age > 110) return null;
  return age < 18 ? 'under 18' : age < 25 ? '18–24' : age < 35 ? '25–34' : age < 45 ? '35–44' : age < 55 ? '45–54' : age < 65 ? '55–64' : '65+';
}
