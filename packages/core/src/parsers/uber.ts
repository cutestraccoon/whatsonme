import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, parseCsv, toMs } from '../util/text.js';

/**
 * Uber "Download your data" (CSV). Rider/trips_data.csv for rides, Eats/eats_order_details.csv for food.
 * Timestamps look like "2024-03-12 10:21:33 +0000 UTC". Distance is in miles; we store km.
 */
export const uber: Parser = {
  source: 'uber',
  detect: (paths) => paths.some((p) => /(^|\/)trips_data\.csv$|(^|\/)eats_order_details\.csv$|uber.*\/(rider|eats)\/[^/]+\.csv$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    let cancelled = 0; let completed = 0; let totalKm = 0; const currencies = new Map<string, number>(); const cities = new Map<string, number>();

    for (const p of byName(paths, /(^|\/)trips_data\.csv$/)) {
      files.push(p);
      for (const r of parseCsv(await a.text(p))) {
        const status = g(r, 'Trip or Order Status', 'Status');
        const city = g(r, 'City');
        if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
        if (/cancel|rider_cancel|driver_cancel|unfulfilled/i.test(status)) { cancelled++; continue; }
        const t = ts(g(r, 'Begin Trip Time', 'Request Time', 'Dropoff Time')); if (!t) continue;
        const miles = num(g(r, 'Distance (miles)', 'Distance')); const km = miles == null ? undefined : Math.round(miles * 1.609344 * 100) / 100;
        const fare = num(g(r, 'Fare Amount', 'Fare')); const cur = g(r, 'Fare Currency', 'Currency');
        if (cur) currencies.set(cur, (currencies.get(cur) ?? 0) + (fare ?? 0));
        if (km) totalKm += km; completed++;
        const lat = num(g(r, 'Begin Trip Lat')); const lon = num(g(r, 'Begin Trip Lng', 'Begin Trip Lon'));
        const drop = ts(g(r, 'Dropoff Time'));
        events.push({ ts: t, source: 'uber', kind: 'trip', title: g(r, 'Begin Trip Address') || undefined, value: km, lat: lat ?? undefined, lon: lon ?? undefined, file: p,
          meta: { product: g(r, 'Product Type'), status, city, fare: fare ?? undefined, currency: cur, dropoffLat: num(g(r, 'Dropoff Lat')) ?? undefined, dropoffLon: num(g(r, 'Dropoff Lng', 'Dropoff Lon')) ?? undefined, dropoffAddress: g(r, 'Dropoff Address'), durationMin: drop && drop > t ? Math.round((drop - t) / 60000) : undefined, requested: ts(g(r, 'Request Time')) ?? undefined } });
      }
      claims.push({ source: 'uber', field: 'trips_completed', value: String(completed), file: p });
      claims.push({ source: 'uber', field: 'trips_cancelled', value: String(cancelled), file: p });
      if (totalKm) claims.push({ source: 'uber', field: 'trips_total_km', value: String(Math.round(totalKm)), file: p });
      for (const [c, n] of cities) claims.push({ source: 'uber', field: 'trip_city', value: c, file: p, meta: { trips: n } });
      for (const [c, s] of currencies) claims.push({ source: 'uber', field: 'trips_total_spend', value: `${Math.round(s * 100) / 100} ${c}`, file: p });
    }
    for (const p of byName(paths, /(^|\/)eats_order_details\.csv$/)) {
      files.push(p); let n = 0;
      for (const r of parseCsv(await a.text(p))) {
        const status = g(r, 'Order Status', 'Status');
        if (/cancel|unfulfilled/i.test(status)) continue;
        const t = ts(g(r, 'Order Time', 'Request Time', 'Order Date')); if (!t) continue; n++;
        events.push({ ts: t, source: 'uber', kind: 'purchase', title: g(r, 'Restaurant Name', 'Restaurant', 'Store'), value: num(g(r, 'Order Price', 'Order Total', 'Total', 'Item Price')) ?? undefined, file: p,
          meta: { currency: g(r, 'Currency', 'Currency Code'), city: g(r, 'City'), status, address: g(r, 'Delivery address', 'Delivery Address', 'Dropoff Address').slice(0, 60), items: g(r, 'Item Name', 'Items').slice(0, 120) } });
      }
      claims.push({ source: 'uber', field: 'eats_orders', value: String(n), file: p });
    }
    if (!files.length) warnings.push('Uber: archive recognized but no trips_data.csv / eats_order_details.csv found.');
    onProgress?.(`Uber: ${events.length} events, ${claims.length} claims`);
    return { source: 'uber', events, claims, files, warnings } satisfies ParseResult;
  },
};

function g(r: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) { if (r[k] != null && r[k] !== '') return r[k].trim(); }
  const lower = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) { const v = lower[k.toLowerCase()]; if (v) return v.trim(); }
  return '';
}
function num(s: string): number | null { if (!s) return null; const n = Number(s.replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; }
/** "2024-03-12 10:21:33 +0000 UTC" -> ms */
function ts(s: string): number | null { if (!s) return null; return toMs(s.replace(/\s*UTC$/i, '').replace(/\s+([+-]\d{4})$/, '$1')); }
