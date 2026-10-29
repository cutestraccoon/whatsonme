import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { basename, byName, parseCsv, safeJson, toMs } from '../util/text.js';
import { activityToEvent, parseActivityHtml } from './google-html.js';

/**
 * Google Takeout (JSON). Also handles the new on-device Maps Timeline export (Timeline.json)
 * and the old Semantic Location History. HTML activity files are detected and flagged.
 */
export const google: Parser = {
  source: 'google',
  // Folder names are localized (German "Meine Aktivitäten", "Standortverlauf", "Chrome/Verlauf.json"); match the common ones, and parse by file shape below.
  detect: (paths) => paths.some((p) => /(^|\/)takeout\//.test(p) || /my ?activity|meine aktivit|mon activit|mi actividad|minha atividade|la mia attivit|mijn activiteit|standortverlauf|location history|youtube (and|und|et|y|e|en) youtube music|watch-history|semantic location history|timeline\.json|records\.json|browserhistory\.json|chrome\/(history|verlauf|historique|historial|hist[oó]rico|cronologia|geschiedenis)\.json|\d{4}\/\d{4}_[a-z]+\.json$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const read = async (p: string) => { files.push(p); return safeJson<any>(await a.text(p)); };
    const seenYt = new Set<string>(); // Takeout ships YouTube twice (My Activity/YouTube and YouTube/history); keep one

    // My Activity / <product>/MyActivity.json  (Search, YouTube, Ads, Chrome, Maps, Assistant, Discover, Play...)
    const activity = (j: any[], product: string, p: string) => {
      for (const it of j) {
        const t = toMs(it.time); if (!t) continue;
        const title: string = it.title ?? '';
        let kind: Event['kind'] = 'other'; let clean = title;
        if (/^searched for /i.test(title)) { kind = 'search'; clean = title.replace(/^searched for /i, ''); }
        else if (/^watched /i.test(title)) { kind = 'watch'; clean = title.replace(/^watched /i, ''); }
        else if (/^visited /i.test(title)) { kind = 'visit'; clean = title.replace(/^visited /i, ''); }
        else if (/^viewed /i.test(title)) { kind = /ad/i.test(product) ? 'ad_view' : 'visit'; clean = title.replace(/^viewed /i, ''); }
        else if (/^used /i.test(title)) { kind = 'session'; clean = title.replace(/^used /i, ''); }
        else if (/^said |^asked /i.test(title)) { kind = 'other'; clean = title; }
        if (/ads/i.test(product) && kind === 'other') kind = 'ad_view';
        const src = /youtube/i.test(product) ? 'youtube' : 'google';
        if (src === 'youtube') seenYt.add(t + '|' + (it.titleUrl ?? ''));
        events.push({ ts: t, source: src, kind, title: clean, url: it.titleUrl, actor: it.subtitles?.[0]?.name, file: p, meta: { product, audio: !!it.audioFiles?.length, location: it.locationInfos?.[0]?.name ?? undefined } });
        if (/ads/i.test(product)) for (const d of it.details ?? []) if (d.name) claims.push({ source: 'google', field: 'ad_detail', value: d.name, file: p });
      }
    };
    for (const p of byName(paths, /my ?activity\/[^/]+\/(myactivity|my activity)\.json$/)) { const j = await read(p); if (Array.isArray(j)) activity(j, p.split('/').slice(-2, -1)[0], p); }
    // HTML flavour (Takeout's default). Parsed when the JSON twin is absent; HTML stamps are coarser (second precision, zone abbreviations).
    let htmlParsed = 0;
    for (const p of byName(paths, /my ?activity\/[^/]+\/(myactivity|my activity)\.html$/)) {
      const product = p.split('/').slice(-2, -1)[0];
      if (paths.some((q) => q.startsWith(p.slice(0, p.lastIndexOf('/') + 1)) && /\.json$/.test(q))) continue;
      files.push(p); const entries = parseActivityHtml(await a.text(p), product);
      for (const e of entries) { const ev = activityToEvent(e, product, p, claims); if (!ev) continue; if (ev.source === 'youtube') seenYt.add(ev.ts + '|' + (ev.url ?? '')); events.push(ev); htmlParsed++; }
    }
    if (htmlParsed) warnings.push(`Google: parsed ${htmlParsed} My Activity entries from HTML. It works, but JSON is more precise (exact timestamps, every field). Next time request Takeout with format "JSON".`);

    // YouTube history (watch-history.json, search-history.json)
    for (const p of byName(paths, /(watch-history|search-history)\.json$/)) {
      const j = await read(p); if (!Array.isArray(j)) continue;
      // The same ad-watch row appears in BOTH watch-history and search-history (real 2026 export); dedupe across files too.
      for (const it of j) { const t = toMs(it.time); if (!t) continue; const key = t + '|' + (it.titleUrl ?? ''); if (seenYt.has(key)) continue; seenYt.add(key); const w = /^watched /i.test(it.title ?? ''); const s = /^searched for /i.test(it.title ?? '');
        events.push({ ts: t, source: 'youtube', kind: w ? 'watch' : s ? 'search' : 'other', title: (it.title ?? '').replace(/^(watched|searched for) /i, ''), url: it.titleUrl, actor: it.subtitles?.[0]?.name, file: p, meta: { ad: /from google ads/i.test(JSON.stringify(it.details ?? '')) } }); }
    }
    for (const p of byName(paths, /youtube.*\/(subscriptions|likes|liked videos)\.(csv|json)$/)) { files.push(p); const txt = await a.text(p); const rows = p.endsWith('.csv') ? parseCsv(txt) : []; claims.push({ source: 'youtube', field: basename(p).startsWith('sub') ? 'subscriptions_count' : 'liked_videos_count', value: String(rows.length), file: p }); }

    // Location: Semantic Location History (old), one file per month
    const MONTH = /\d{4}\/\d{4}_(january|february|march|april|may|june|july|august|september|october|november|december)\.json$/;
    const semantic = (j: any, p: string) => {
      for (const o of j?.timelineObjects ?? []) {
        if (o.placeVisit) { const v = o.placeVisit; const t = toMs(v.duration?.startTimestamp ?? v.duration?.startTimestampMs); const te = toMs(v.duration?.endTimestamp ?? v.duration?.endTimestampMs); if (!t) continue;
          events.push({ ts: t, source: 'google', kind: 'location', title: v.location?.name ?? v.location?.address ?? 'place', lat: e7(v.location?.latitudeE7), lon: e7(v.location?.longitudeE7), value: te ? te - t : undefined, file: p, meta: { semantic: v.location?.semanticType, confidence: v.placeConfidence, prob: v.location?.locationConfidence } });
          if (v.location?.semanticType && /HOME|WORK/.test(v.location.semanticType)) claims.push({ source: 'google', field: 'inferred_' + v.location.semanticType.replace('TYPE_', '').toLowerCase(), value: v.location?.address ?? v.location?.name ?? 'labelled place', confidence: (v.location?.locationConfidence ?? 0) / 100, file: p }); }
        if (o.activitySegment) { const s = o.activitySegment; const t = toMs(s.duration?.startTimestamp ?? s.duration?.startTimestampMs); const te = toMs(s.duration?.endTimestamp ?? s.duration?.endTimestampMs); if (!t) continue; const top = s.activities?.[0];
          events.push({ ts: t, source: 'google', kind: 'trip', title: s.activityType ?? top?.activityType ?? 'trip', value: s.distance, lat: e7(s.startLocation?.latitudeE7), lon: e7(s.startLocation?.longitudeE7), file: p, meta: { duration: te ? te - t : undefined, confidence: s.confidence, prob: top?.probability } }); }
      }
    };
    for (const p of byName(paths, MONTH)) semantic(await read(p), p);
    // Location: new on-device Timeline.json. Android: { semanticSegments: [...] }, iOS: a bare array of segments with "geo:lat,lon" strings.
    for (const p of byName(paths, /(^|\/)timeline\.json$/)) {
      const j = await read(p);
      if (j?.timelineObjects) { semantic(j, p); continue; }
      const segs: any[] = Array.isArray(j) ? j : Array.isArray(j?.semanticSegments) ? j.semanticSegments : [];
      for (const s of segs) {
        const t = toMs(s.startTime); const te = toMs(s.endTime); if (!t) continue;
        if (s.visit) { const c = s.visit.topCandidate ?? {}; const ll = parseLatLng(c.placeLocation?.latLng ?? c.placeLocation);
          events.push({ ts: t, source: 'google', kind: 'location', title: c.name ?? c.semanticType ?? c.placeId ?? c.placeID ?? 'place', lat: ll?.[0], lon: ll?.[1], value: te ? te - t : undefined, file: p, meta: { semantic: c.semanticType, prob: Number(c.probability ?? s.visit.probability) } });
          if (c.semanticType && /home|work/i.test(c.semanticType)) claims.push({ source: 'google', field: 'inferred_' + c.semanticType.replace(/^INFERRED_/i, '').toLowerCase(), value: ll ? `${ll[0].toFixed(3)}, ${ll[1].toFixed(3)}` : 'labelled place', confidence: Number(c.probability ?? s.visit.probability) || undefined, file: p }); }
        if (s.activity) { const c = s.activity.topCandidate ?? {}; const ll = parseLatLng(s.activity.start?.latLng ?? s.activity.start);
          events.push({ ts: t, source: 'google', kind: 'trip', title: c.type ?? 'trip', value: Number(s.activity.distanceMeters) || undefined, lat: ll?.[0], lon: ll?.[1], file: p, meta: { duration: te ? te - t : undefined, prob: Number(c.probability) } }); }
        // iOS writes {point, time}; Android writes {point, durationMinutesOffsetFromStartTime}
        if (s.timelinePath) for (const pt of s.timelinePath) { const ll = parseLatLng(pt.point); const off = Number(pt.durationMinutesOffsetFromStartTime); const tt = toMs(pt.time) ?? (Number.isFinite(off) && pt.durationMinutesOffsetFromStartTime != null ? t + off * 60000 : null); if (ll && tt) events.push({ ts: tt, source: 'google', kind: 'location', title: 'path', lat: ll[0], lon: ll[1], file: p, meta: { raw: true } }); }
      }
    }
    // Raw Records.json (can be huge: sample every Nth)
    for (const p of byName(paths, /location history.*\/records\.json$/)) {
      const j = await read(p); const locs = j?.locations ?? []; const step = Math.max(1, Math.floor(locs.length / 20000));
      for (let i = 0; i < locs.length; i += step) { const l = locs[i]; const t = toMs(l.timestamp ?? l.timestampMs); if (t) events.push({ ts: t, source: 'google', kind: 'location', title: 'ping', lat: e7(l.latitudeE7), lon: e7(l.longitudeE7), file: p, meta: { raw: true, accuracy: l.accuracy } }); }
      claims.push({ source: 'google', field: 'raw_location_pings', value: String(locs.length), file: p });
    }
    // Chrome browser history
    for (const p of byName(paths, /chrome\/(browserhistory|history|verlauf|historique|historial|hist[oó]rico|cronologia|geschiedenis)\.json$/)) { const j = await read(p); for (const h of j?.['Browser History'] ?? []) { const t = h.time_usec ? Math.floor(h.time_usec / 1000) : toMs(h.time); if (t) events.push({ ts: t, source: 'browser', kind: 'visit', title: h.title, url: h.url, file: p, meta: { via: 'chrome-sync' } }); } }
    // Play Store installs
    for (const p of byName(paths, /google play store\/installs\.json$/)) { const j = await read(p); for (const it of j ?? []) { const t = toMs(it.install?.firstInstallationTime); if (t) events.push({ ts: t, source: 'google', kind: 'install', title: it.install?.doc?.title, file: p, meta: { device: it.install?.deviceAttribute?.model } }); } }
    // Access log (CSV): every service accessed, with IP + user agent
    for (const p of byName(paths, /access log activity\/.*\.csv$/)) { files.push(p); const rows = parseCsv(await a.text(p)); const ips = new Set<string>(); for (const r of rows) { const t = toMs(r['Activity Timestamp'] ?? r['Timestamp']); const ip = r['IP Address'] ?? ''; if (ip) ips.add(ip); if (t) events.push({ ts: t, source: 'google', kind: 'login', title: r['Product Name'] ?? r['Activity Type'] ?? '', file: p, meta: { ip: maskIp(ip), ua: r['User Agent String'] ?? '' } }); } claims.push({ source: 'google', field: 'unique_ips', value: String(ips.size), file: p }); }
    // Ads / My Ad Center demographics, if present
    for (const p of byName(paths, /(my ad center|ads personalization|ad settings).*\.(json|csv)$/)) { files.push(p); const txt = await a.text(p); const j = safeJson<any>(txt); const scan = (o: any, depth = 0) => { if (depth > 5 || !o) return; if (typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /age|gender|income|parent|education|home ?owner|marital|employ|industry|language/i.test(k)) claims.push({ source: 'google', field: 'ad_demographic_' + k.toLowerCase(), value: v, file: p }); else scan(v, depth + 1); } }; scan(j); }
    // Maps: labeled places (Home/Work the user told Google), reviews (place + time + rating), Chrome synced devices
    for (const p of byName(paths, /maps\/my labeled places\/labeled places\.json$/)) { const j = await read(p); for (const f of j?.features ?? []) { const name = f?.properties?.name; if (!name) continue; const [lon, lat] = f.geometry?.coordinates ?? []; claims.push({ source: 'google', field: 'labeled_place', value: String(name), file: p, meta: { address: f.properties?.address ?? '', lat: typeof lat === 'number' ? Number(lat.toFixed(3)) : undefined, lon: typeof lon === 'number' ? Number(lon.toFixed(3)) : undefined } }); } }
    for (const p of byName(paths, /maps \(your places\)\/reviews\.json$/)) { const j = await read(p); for (const f of j?.features ?? []) { const pr = f?.properties ?? {}; const t = toMs(pr.date ?? pr.published); if (!t) continue; const [lon, lat] = f.geometry?.coordinates ?? []; events.push({ ts: t, source: 'google', kind: 'post', title: pr.location?.name ?? pr.location?.address ?? 'review', url: pr.google_maps_url, lat: typeof lat === 'number' ? lat : undefined, lon: typeof lon === 'number' ? lon : undefined, file: p, meta: { what: 'maps_review', rating: Number(pr.five_star_rating_published) || undefined } }); } }
    for (const p of byName(paths, /chrome\/device information\.json$/)) { const j = await read(p); for (const d of j?.['Device Info'] ?? []) { const v = d?.sync_user_agent ?? d?.device_type; if (v) claims.push({ source: 'google', field: 'device', value: String(v).replace(/ \([0-9a-f]+-refs[^)]*\)/, ''), file: p, meta: { type: d.device_type ?? '', manufacturer: d.manufacturer ?? '', model: d.model ?? '' } }); } }
    // Profile
    for (const p of byName(paths, /profile\/profile\.json$/)) { const j = await read(p); if (j?.gender?.type) claims.push({ source: 'google', field: 'declared_gender', value: j.gender.type, file: p }); const bd = j?.birthday; const yr = typeof bd === 'object' && bd ? String(bd.year ?? '') : String(bd ?? '').match(/\d{4}/)?.[0] ?? ''; if (yr) claims.push({ source: 'google', field: 'declared_birthday', value: yr + '-••-••', file: p }); }

    // Shape fallback for localized exports: any JSON not consumed above that is an array of {header,title,time} rows is a My Activity file
    // (product = its folder, e.g. "Meine Aktivitäten/YouTube"), and any object with one array of {url,time_usec} rows is Chrome history.
    const seen = new Set(files);
    for (const p of paths) {
      if (seen.has(p) || !p.endsWith('.json') || a.size(p) < 20 || a.size(p) > 512 * 1024 * 1024) continue;
      const txt = await a.text(p); const head = txt.slice(0, 400);
      if (/^\s*\[\s*\{[^]*?"header"\s*:/.test(head) && /"time"\s*:/.test(head)) { const j = safeJson<any>(txt); if (Array.isArray(j) && j.length && j[0]?.header != null && j[0]?.time != null) { files.push(p); const folder = p.split('/').slice(-2, -1)[0] ?? ''; activity(j, /youtube/i.test(folder + ' ' + j[0].header) ? 'YouTube' : folder || String(j[0].header), p); } continue; }
      if (/^\s*\{\s*"[^"]+"\s*:\s*\[\s*\{[^]*?"time_usec"/.test(head)) { const j = safeJson<any>(txt); const arr = Object.values(j ?? {}).find(Array.isArray) as any[] | undefined; if (arr?.length && arr[0]?.url) { files.push(p); for (const h of arr) { const t = h.time_usec ? Math.floor(h.time_usec / 1000) : toMs(h.time); if (t) events.push({ ts: t, source: 'browser', kind: 'visit', title: h.title, url: h.url, file: p, meta: { via: 'chrome-sync' } }); } } }
    }
    if (!files.length) warnings.push('Google: nothing recognized. Select JSON format and at least: My Activity, YouTube, Location History, Chrome, Access Log Activity, Play Store.');
    onProgress?.(`Google: ${events.length} events, ${claims.length} claims`);
    return { source: 'google', events, claims, files, warnings } satisfies ParseResult;
  },
};

function e7(v: any): number | undefined { return typeof v === 'number' ? v / 1e7 : undefined; }
function parseLatLng(s: any): [number, number] | undefined { if (typeof s !== 'string') return; const m = s.match(/(-?\d+(?:\.\d+)?)°?,\s*(-?\d+(?:\.\d+)?)/); return m ? [Number(m[1]), Number(m[2])] : undefined; }

function maskIp(ip: unknown): string { const s = String(ip ?? ''); const m = s.match(/^(\d+\.\d+)\.\d+\.\d+$/); if (m) return m[1] + '.•.•'; if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + ':••'; return s; }
