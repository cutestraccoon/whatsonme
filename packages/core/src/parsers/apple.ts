import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, parseCsv, toMs } from '../util/text.js';

/**
 * Apple: privacy.apple.com export (CSV folders: "Apple Media Services information", "App Store",
 * "Apple Music Play Activity", "Wallet Activity", "Game Center") + Apple Health export.xml
 * (Health app -> profile -> Export All Health Data).
 */
export const apple: Parser = {
  source: 'apple',
  detect: (paths) => paths.some((p) => /apple media services|apple music play activity|app store click activity|apple_health_export|export\.xml$|wallet activity|game center/i.test(p)),
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
