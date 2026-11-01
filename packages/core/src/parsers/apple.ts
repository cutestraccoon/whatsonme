import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, parseCsv, safeJson, toMs } from '../util/text.js';

/**
 * Apple: privacy.apple.com export (CSV folders: "Apple Media Services information", "App Store",
 * "Apple Music Play Activity", "Wallet Activity", "Game Center") + Apple Health export.xml
 * (Health app -> profile -> Export All Health Data).
 */
export const apple: Parser = {
  source: 'apple',
  detect: (paths) => paths.some((p) => /apple media services|apple_media_services|apple music|app store click activity|apple_health_export|export\.xml$|wallet activity|game center|apple id account information|store transaction history|online purchase history|applecare|hide my email|sign in with apple|knownnetworks\.xml|maps_location_attributes|workout-routes\/|electrocardiograms\//i.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const csv = async (p: string) => { files.push(p); return parseCsv(await a.text(p)); };

    for (const p of byName(paths, /apple music play activity.*\.csv$/)) {
      for (const r of await csv(p)) { const t = toMs(r['Event Start Timestamp'] ?? r['Event Received Timestamp']); if (!t) continue;
        events.push({ ts: t, source: 'apple', kind: 'play', title: r['Song Name'] ?? r['Content Name'], actor: r['Artist Name'] ?? r['Container Artist Name'], value: Number(r['Play Duration Milliseconds']) || undefined, file: p, meta: { end: r['End Reason Type'], skipped: /SCRUB|SKIP|MANUAL/i.test(r['End Reason Type'] ?? ''), device: r['Device Type'] ?? '' } }); }
    }
    for (const p of byName(paths, /app store click activity.*\.csv$/)) { for (const r of await csv(p)) { const t = toMs(r['Event Date Time'] ?? r['Event Date']); if (t) events.push({ ts: t, source: 'apple', kind: r['Event Type']?.toLowerCase().includes('search') ? 'search' : 'visit', title: r['Search Query'] ?? r['App Name'] ?? r['Item Name'] ?? r['Event Type'], file: p, meta: { type: r['Event Type'] } }); } }
    for (const p of byName(paths, /(itunes store|app store).*(purchase|download|install).*\.csv$/i)) { for (const r of await csv(p)) { const t = toMs(r['Purchase Date'] ?? r['Download Date'] ?? r['Date']); if (t) events.push({ ts: t, source: 'apple', kind: /purchase/i.test(p) ? 'purchase' : 'install', title: r['Item Description'] ?? r['Title'] ?? r['App Name'], value: Number(r['Paid Amount'] ?? r['Price']) || undefined, file: p }); } }
    for (const p of byName(paths, /wallet activity.*\.csv$/)) { for (const r of await csv(p)) { const t = toMs(r['Transaction Date'] ?? r['Date']); if (t) events.push({ ts: t, source: 'apple', kind: 'purchase', title: r['Merchant'] ?? r['Description'], value: Number(r['Amount']) || undefined, file: p, meta: { via: 'apple-pay' } }); } }
    for (const p of byName(paths, /game center.*\.csv$/)) { for (const r of await csv(p)) { const t = toMs(r['Last Played Date'] ?? r['Date'] ?? r['Achieved Date']); if (t) events.push({ ts: t, source: 'apple', kind: 'session', title: r['Game Name'] ?? r['Title'], file: p, meta: { via: 'game-center' } }); } }
    for (const p of byName(paths, /apple id account and device information.*\.csv$/)) { for (const r of await csv(p)) { for (const k of ['Device Model', 'Model', 'Device Name']) if (r[k]) claims.push({ source: 'apple', field: 'device', value: r[k], file: p }); } }


    // ---- Wider privacy.apple.com coverage. Column names vary by year/region, so every lookup is by pattern, never by exact header. ----
    const col = (r: Record<string, string>, ...res: RegExp[]) => { for (const re of res) { const k = Object.keys(r).find((h) => re.test(h)); if (k && r[k] !== '') return r[k]; } return undefined; };
    const when = (r: Record<string, string>, ...extra: RegExp[]) => { const v = col(r, ...extra, /(event|start|received|play|purchase|order|transaction|download|sign.?in|login|last.*(played|used)|date).*(time|date|timestamp)/i, /^(date|time|timestamp)/i, /date|time/i); return v ? ymd(v) : null; };
    const money = (v?: string) => { if (!v) return undefined; const n = Number(v.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) && n !== 0 ? n : undefined; };

    // Apple Music: daily track history ("Date Played" = YYYYMMDD, "Hours" = list of hours), track play history, playback activity
    for (const p of byName(paths, /play history daily tracks.*\.csv$/)) {
      for (const r of await csv(p)) { const day = ymd(col(r, /date played/i, /^date/i) ?? ''); if (!day) continue; const hours = (col(r, /^hours?$/i) ?? '12').split(/[,\s]+/).map(Number).filter((h) => h >= 0 && h < 24);
        const [artist, song] = splitTrack(col(r, /track description/i, /song|title|name/i)); const ms = Number(col(r, /play duration/i)) || undefined;
        for (const h of hours.length ? hours : [12]) events.push({ ts: day + h * 3600000, source: 'apple', kind: 'play', title: song, actor: artist, value: ms, file: p, meta: { via: 'daily', device: col(r, /device|source type/i) ?? '' } }); }
    }
    for (const p of byName(paths, /(track play history|playback activity)\.csv$/)) {
      for (const r of await csv(p)) { const t = when(r); if (!t) continue; const [artist, song] = splitTrack(col(r, /track description/i, /song.*name|content name|title/i)); const a2 = col(r, /artist/i) ?? artist;
        events.push({ ts: t, source: 'apple', kind: 'play', title: song, actor: a2, value: Number(col(r, /play duration/i)) || undefined, file: p, meta: { via: 'history', skipped: /SCRUB|SKIP|MANUAL/i.test(col(r, /end reason/i) ?? '') } }); }
    }
    for (const p of byName(paths, /likes and dislikes.*\.csv$/)) {
      let n = 0; for (const r of await csv(p)) { n++; const t = when(r, /date (added|created|modified)/i); const pref = col(r, /preference|rating|like|favou?rite/i) ?? ''; const title = col(r, /item description|track description|name|title|description/i);
        if (t) events.push({ ts: t, source: 'apple', kind: 'like', title, actor: col(r, /artist/i), file: p, meta: { via: 'apple-music', disliked: /dislike|negative|-1|down/i.test(pref) } }); }
      claims.push({ source: 'apple', field: 'apple_music_ratings', value: `${n} songs liked or disliked`, file: p });
    }
    for (const p of byName(paths, /podcasts? playstate.*\.csv$/)) { for (const r of await csv(p)) { const t = when(r, /last.*(play|listen)/i); const title = col(r, /episode|title|show|podcast|name/i); if (t && title) events.push({ ts: t, source: 'apple', kind: 'play', title, actor: col(r, /show|podcast|collection/i), value: (Number(col(r, /play.?(head|time|position)|duration/i)) || undefined), file: p, meta: { via: 'podcasts' } }); } }
    for (const p of byName(paths, /(arcade app usage|fitness plus activity).*\.csv$/)) { for (const r of await csv(p)) { const t = when(r); if (t) events.push({ ts: t, source: 'apple', kind: 'session', title: col(r, /app name|game|workout|title|name/i), value: (Number(col(r, /duration|time spent|minutes/i)) || undefined), file: p, meta: { via: /arcade/i.test(p) ? 'arcade' : 'fitness-plus' } }); } }

    // Purchases and subscriptions (App Store / iTunes / Apple Online Store / retail receipts)
    for (const p of byName(paths, /((store (free )?transaction history|online purchase history|hidden purchases|purchase history)\.csv|retail store receipts?.*\.csv)$/i)) {
      const free = /free/i.test(p);
      for (const r of await csv(p)) { const t = when(r, /(purchase|order|transaction|receipt) date/i); if (!t) continue;
        events.push({ ts: t, source: 'apple', kind: 'purchase', title: col(r, /item description|item|product|app name|title|description/i), value: free ? undefined : money(col(r, /billed amount|amount|price|total|paid/i)), file: p, meta: { via: /online|retail/i.test(p) ? 'apple-store' : 'app-store', free, currency: col(r, /currency/i) ?? '', device: col(r, /device/i) ?? '' } }); }
    }
    for (const p of byName(paths, /subscription history.*\.csv$/)) { for (const r of await csv(p)) { const name = col(r, /subscription|item|product|name|title|description/i); const t = when(r, /(start|purchase|renew|subscription).*date/i);
      if (name) claims.push({ source: 'apple', field: 'subscription', value: name, file: p, meta: { since: t ? new Date(t).toISOString().slice(0, 10) : '', price: col(r, /price|amount|billed/i) ?? '' } }); if (t) events.push({ ts: t, source: 'apple', kind: 'purchase', title: name ? 'Subscription: ' + name : 'Subscription', value: money(col(r, /price|amount|billed/i)), file: p, meta: { via: 'subscription' } }); } }
    for (const p of byName(paths, /(app authorization history|apps using sign in with apple).*\.csv$/)) { for (const r of await csv(p)) { const name = col(r, /app name|app|developer|team|name|bundle/i); const t = when(r);
      if (name) claims.push({ source: 'apple', field: 'sign_in_with_apple', value: name, file: p }); if (t) events.push({ ts: t, source: 'apple', kind: 'login', title: name, file: p, meta: { via: 'sign-in-with-apple' } }); } }

    // Account: sign-ins, devices, support, Hide My Email
    for (const p of byName(paths, /apple id account information.*\.csv$/)) { for (const r of await csv(p)) {
      const bd = col(r, /birth/i); const by = bd && ymd(bd) ? new Date(ymd(bd)!).getUTCFullYear() : bd?.match(/(19|20)\d{2}/)?.[0]; if (by) claims.push({ source: 'apple', field: 'declared_birth_year', value: String(by), file: p });
      const ctry = col(r, /country|region/i); if (ctry) claims.push({ source: 'apple', field: 'profile_based_in', value: ctry, file: p });
      const em = col(r, /^(apple id|email)/i, /email/i); if (em) claims.push({ source: 'apple', field: 'declared_email_address', value: maskText(em), file: p });
      const created = when(r, /(account )?creat/i); if (created) claims.push({ source: 'apple', field: 'account_created', value: new Date(created).toISOString().slice(0, 10), file: p }); } }
    for (const p of byName(paths, /(sign.?in (activity|history)|login (activity|history)|apple id sign.?in)[^/]*\.csv$/)) { for (const r of await csv(p)) { const t = when(r); if (t) events.push({ ts: t, source: 'apple', kind: 'login', title: col(r, /device|browser|user agent|app/i), file: p, meta: { ip: maskIpText(col(r, /ip/i)), place: col(r, /location|city|country/i) ?? '', via: 'apple-id' } }); } }
    for (const p of byName(paths, /(devices?( list)?|device (details|information)|applecare device details)\.csv$/)) { for (const r of await csv(p)) { const m = col(r, /model|device name|product|device type/i); if (m) claims.push({ source: 'apple', field: 'device', value: m, file: p, meta: { os: col(r, /os|software|version/i) ?? '' } }); } }
    for (const p of byName(paths, /hide my email.*\.csv$/)) { let n = 0; for (const r of await csv(p)) { void r; n++; } if (n) claims.push({ source: 'apple', field: 'hide_my_email_aliases', value: String(n), file: p }); }
    for (const p of byName(paths, /applecare (cases|repairs[^/]*)\.csv$/)) { for (const r of await csv(p)) { const t = when(r, /(case|repair|created|open).*date/i); if (t) events.push({ ts: t, source: 'apple', kind: 'other', title: 'AppleCare: ' + (col(r, /issue|subject|product|device|type|description/i) ?? 'support case'), file: p, meta: { via: 'applecare' } }); } }

    // Maps / Wi-Fi (the "Other Data" archive)
    for (const p of byName(paths, /maps[^/]*\.json$/)) { files.push(p); const j = safeJson<unknown>(await a.text(p)); let n = 0; const pts: { lat: number; lon: number; ts?: number; label?: string }[] = [];
      walkGeo(j, (pt) => { n++; if (pts.length < 3000) pts.push(pt); });
      for (const pt of pts) if (pt.ts) events.push({ ts: pt.ts, source: 'apple', kind: 'location', title: pt.label ?? 'Apple Maps', lat: pt.lat, lon: pt.lon, file: p, meta: { via: 'apple-maps' } });
      if (n) claims.push({ source: 'apple', field: 'apple_maps_places', value: `${n} places or points saved by Apple Maps`, file: p }); }
    for (const p of byName(paths, /known.?networks[^/]*\.(xml|plist)$/)) { files.push(p); const x = await a.text(p); const names = [...x.matchAll(/<key>(?:SSID_STR|SSIDString|SSID)<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
      if (names.length) claims.push({ source: 'apple', field: 'known_wifi_networks', value: `${new Set(names).size} Wi-Fi networks remembered (e.g. ${[...new Set(names)].slice(0, 4).join(', ')})`, file: p }); }

    // Health extras: workout routes (GPS), ECG recordings, clinical records
    for (const p of byName(paths, /workout-routes\/[^/]+\.gpx$/)) { files.push(p); const x = await a.text(p); const re2 = /<trkpt\s+lat="(-?[\d.]+)"\s+lon="(-?[\d.]+)"[^>]*>(?:(?!<\/trkpt>)[\s\S])*?<time>([^<]+)<\/time>/g; let m2: RegExpExecArray | null; let i2 = 0;
      while ((m2 = re2.exec(x))) { if (i2++ % 20) continue; const t = toMs(m2[3]); if (t) events.push({ ts: t, source: 'health', kind: 'location', title: 'workout route', lat: Number(m2[1]), lon: Number(m2[2]), file: p, meta: { via: 'health-gpx' } }); } }
    { const ecg = byName(paths, /electrocardiograms\/[^/]+\.csv$/); if (ecg.length) { files.push(...ecg); claims.push({ source: 'apple', field: 'ecg_recordings', value: String(ecg.length), file: ecg[0] }); } }
    { const cl = byName(paths, /clinical-records\/[^/]+\.json$/); if (cl.length) { files.push(...cl); claims.push({ source: 'apple', field: 'clinical_records', value: `${cl.length} clinical records from linked providers`, file: cl[0] }); } }

    // Health export.xml : stream-ish regex over <Record .../> lines. Daily aggregate for steps/sleep/HR.
    for (const p of byName(paths, /(^|\/)export\.xml$/)) {
      files.push(p);
      // Attribute values may contain '>' (device="<<HKDevice: ...>>"), so match quoted strings, not [^>].
      const re = /<Record\s+((?:[^>"]|"[^"]*")*?)\/?>/g; let m: RegExpExecArray | null; let n = 0;
      const wre = /<Workout\s+((?:[^>"]|"[^"]*")*?)\/?>/g;
      const daily: Record<string, Record<string, number>> = {}; let hr = 0; // heart rate: keep the first and every 25th sample
      const me = /<Me\s+((?:[^>"]|"[^"]*")*?)\/?>/;
      const scan = (txt: string) => {
        re.lastIndex = 0; wre.lastIndex = 0;
        const mm = txt.match(me); if (mm) { const dob = attr(mm[1], 'HKCharacteristicTypeIdentifierDateOfBirth'); const sex = attr(mm[1], 'HKCharacteristicTypeIdentifierBiologicalSex'); const yr = dob?.match(/^\d{4}/)?.[0]; if (yr) claims.push({ source: 'apple', field: 'declared_birth_year', value: yr, file: p }); if (sex && !/NotSet/.test(sex)) claims.push({ source: 'apple', field: 'declared_gender', value: sex.replace('HKBiologicalSex', '').toLowerCase(), file: p }); }
        while ((m = re.exec(txt))) {
          const attrs = m[1]; const type = attr(attrs, 'type'); const startRaw = attr(attrs, 'startDate'); const start = toMs(startRaw); if (!type || !start) continue; n++;
          // Bucket by the LOCAL day written in the export ("2024-03-17 23:48:10 -0400"), not the UTC day.
          const day = /^\d{4}-\d{2}-\d{2}/.test(startRaw ?? '') ? startRaw!.slice(0, 10) : new Date(start).toISOString().slice(0, 10);
          const value = Number(attr(attrs, 'value'));
          const key = type.replace(/^HK(Quantity|Category)TypeIdentifier/, '');
          if (key === 'SleepAnalysis') { const end = toMs(attr(attrs, 'endDate')); if (end) { const v = attr(attrs, 'value') ?? ''; if (/Asleep|InBed/.test(v)) events.push({ ts: start, source: 'health', kind: 'health', title: 'sleep', value: end - start, file: p, meta: { stage: v.replace(/^HKCategoryValueSleepAnalysis/, ''), source: attr(attrs, 'sourceName') } }); } continue; }
          if (['StepCount', 'DistanceWalkingRunning', 'ActiveEnergyBurned', 'FlightsClimbed'].includes(key)) { daily[day] ??= {}; daily[day][key] = (daily[day][key] ?? 0) + (value || 0); continue; }
          if (['HeartRate', 'RestingHeartRate', 'HeartRateVariabilitySDNN', 'RespiratoryRate', 'OxygenSaturation', 'BodyMass', 'BodyMassIndex', 'BodyFatPercentage', 'Height', 'BloodPressureSystolic', 'BloodPressureDiastolic', 'BloodGlucose', 'VO2Max'].includes(key)) { if (key !== 'HeartRate' || hr++ % 25 === 0) events.push({ ts: start, source: 'health', kind: 'health', title: key, value, file: p, meta: { unit: attr(attrs, 'unit'), source: attr(attrs, 'sourceName') } }); continue; }
        }
        while ((m = wre.exec(txt))) { const s = toMs(attr(m[1], 'startDate')); if (s) events.push({ ts: s, source: 'health', kind: 'health', title: 'workout', actor: (attr(m[1], 'workoutActivityType') ?? '').replace('HKWorkoutActivityType', ''), value: Number(attr(m[1], 'duration')) * 60000 || undefined, file: p }); }
      };
      // Multi-GB exports exceed the JS string limit; decode in chunks, cutting at line boundaries (opening tags never span lines).
      const CHUNK = 16 * 1024 * 1024; const buf = await a.bytes(p);
      if (buf.length <= CHUNK) scan(await a.text(p));
      else { const td = new TextDecoder('utf-8'); let carry = '';
        for (let off = 0; off < buf.length; off += CHUNK) { const s = carry + td.decode(buf.subarray(off, Math.min(buf.length, off + CHUNK)), { stream: true }); const cut = s.lastIndexOf('\n'); if (cut < 0) { carry = s; continue; } scan(s.slice(0, cut + 1)); carry = s.slice(cut + 1); }
        scan(carry + td.decode()); }
      for (const [day, m2] of Object.entries(daily)) for (const [k, v] of Object.entries(m2)) events.push({ ts: Date.parse(day + 'T12:00:00Z'), source: 'health', kind: 'health', title: k, value: Math.round(v), file: p, meta: { daily: true } });
      claims.push({ source: 'apple', field: 'health_records', value: String(n), file: p });
    }
    if (!files.length) warnings.push('Apple: nothing recognized. Request from privacy.apple.com and/or export Health from the Health app.');
    onProgress?.(`Apple: ${events.length} events, ${claims.length} claims`);
    return { source: 'apple', events, claims, files, warnings } satisfies ParseResult;
  },
};
function attr(s: string, k: string) { const m = s.match(new RegExp(k + '="([^"]*)"')); return m?.[1]; }

/** "20240315" or any toMs-readable date -> ms (UTC). */
function ymd(s: string): number | null {
  const t = s.trim(); const m = t.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/); if (us) return Date.UTC(+us[3], +us[1] - 1, +us[2], +(us[4] ?? 0), +(us[5] ?? 0), +(us[6] ?? 0));
  return toMs(t);
}
/** "Artist - Song" (Apple's track description) -> [artist, song]. */
function splitTrack(d?: string): [string | undefined, string | undefined] { if (!d) return [undefined, undefined]; const i = d.indexOf(' - '); return i > 0 ? [d.slice(0, i), d.slice(i + 3)] : [undefined, d]; }
function maskText(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }
function maskIpText(ip?: string): string { const s = ip ?? ''; const m = s.match(/^(\d+\.\d+)\.\d+\.\d+$/); if (m) return m[1] + '.•.•'; return s.includes(':') ? s.split(':').slice(0, 3).join(':') + ':••' : s; }
/** Walks any JSON and reports every object that carries a latitude/longitude pair. */
function walkGeo(o: unknown, f: (pt: { lat: number; lon: number; ts?: number; label?: string }) => void, depth = 0): void {
  if (!o || typeof o !== 'object' || depth > 8) return;
  if (Array.isArray(o)) { for (const x of o) walkGeo(x, f, depth + 1); return; }
  const r = o as Record<string, unknown>; const k = (re: RegExp) => Object.keys(r).find((h) => re.test(h));
  const la = k(/^lat(itude)?$/i); const lo = k(/^(lon|lng|long|longitude)$/i);
  if (la && lo && typeof r[la] === 'number' && typeof r[lo] === 'number') { const tk = k(/time|date/i); const nk = k(/^(name|title|label|address)$/i); f({ lat: r[la] as number, lon: r[lo] as number, ts: tk ? toMs(r[tk]) ?? undefined : undefined, label: nk && typeof r[nk] === 'string' ? (r[nk] as string) : undefined }); }
  for (const v of Object.values(r)) walkGeo(v, f, depth + 1);
}
