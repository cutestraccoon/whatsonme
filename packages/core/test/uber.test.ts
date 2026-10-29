import { describe, expect, it } from 'vitest';
import { uber } from '../src/parsers/uber.js';
import { makeUberArchive } from './fixtures/uber.js';
import { checkParser } from './_helpers.js';

describe('uber parser', () => {
  it('parses trips (km, coords, fare) and eats orders, counts cancellations', async () => {
    const res = await checkParser(uber, makeUberArchive(), { kinds: ['trip', 'purchase'], minEvents: 60, claimFields: ['trips_completed', 'trips_cancelled', 'trips_total_km', 'eats_orders', 'trip_city'] });
    const trips = res.events.filter((e) => e.kind === 'trip');
    expect(trips.length).toBeGreaterThan(40);
    expect(trips.every((e) => typeof e.lat === 'number' && typeof e.lon === 'number' && typeof e.value === 'number' && e.value > 0)).toBe(true);
    expect(trips.every((e) => typeof e.meta?.fare === 'number' && typeof e.meta?.dropoffLat === 'number' && e.meta?.status === 'COMPLETED')).toBe(true);
    expect(Number(res.claims.find((c) => c.field === 'trips_completed')?.value)).toBe(trips.length);
    expect(Number(res.claims.find((c) => c.field === 'trips_cancelled')?.value)).toBeGreaterThan(0);
    expect(Number(res.claims.find((c) => c.field === 'trips_cancelled')?.value) + trips.length).toBe(70);
    const eats = res.events.filter((e) => e.kind === 'purchase');
    expect(eats.length).toBeGreaterThan(25);
    expect(eats.every((e) => e.title && typeof e.value === 'number')).toBe(true);
    expect(res.warnings).toEqual([]);
  });
});
