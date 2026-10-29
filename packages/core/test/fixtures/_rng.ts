import { MapArchive } from '../../src/util/archive.js';

/** Deterministic PRNG (mulberry32) so fixtures are stable across runs. */
export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

export const DAY = 86400000;
export const START = Date.UTC(2024, 0, 15); // 2024-01-15
export const END = Date.UTC(2024, 8, 30);   // 2024-09-30

/**
 * Plausible time-of-day: weighted toward evenings, some lunch, little at night.
 * Returns ms within the given UTC day.
 */
export function hourOfDay(r: ReturnType<typeof rng>): number {
  const buckets: [number, number, number][] = [[7, 9, 1], [12, 14, 2], [17, 20, 4], [20, 24, 5], [0, 2, 1]];
  const total = buckets.reduce((n, b) => n + b[2], 0); let x = r.next() * total;
  for (const [lo, hi, w] of buckets) { if (x < w) return (lo + r.next() * (hi - lo)) * 3600000; x -= w; }
  return 20 * 3600000;
}
/** Random timestamp between START and END with evening-weighted time of day. */
export function randomTs(r: ReturnType<typeof rng>, start = START, end = END): number {
  const days = Math.floor((end - start) / DAY);
  return start + r.int(0, days) * DAY + Math.floor(hourOfDay(r));
}
export function iso(ms: number): string { return new Date(ms).toISOString(); }
export function pad(n: number) { return String(n).padStart(2, '0'); }
/** "YYYY-MM-DD HH:MM:SS" (UTC) */
export function sqlTs(ms: number): string { return iso(ms).replace('T', ' ').slice(0, 19); }
export function ymd(ms: number): string { return iso(ms).slice(0, 10); }

const enc = new TextEncoder();
export function archive(files: Record<string, string | Uint8Array>): MapArchive {
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) out[k.toLowerCase()] = typeof v === 'string' ? enc.encode(v) : v;
  return new MapArchive(out);
}
export const json = (v: unknown) => JSON.stringify(v, null, 2);

export const ARTISTS = ['Fairuz', 'Frank Ocean', 'Daft Punk', 'Khruangbin', 'Sade', 'Tame Impala', 'Nancy Ajram', 'The Weeknd', 'Bonobo', 'Amr Diab'];
export const TRACKS = ['Nights', 'Pyramids', 'Smooth Operator', 'Get Lucky', 'Habibi', 'Kerosene', 'White Gloves', 'Blinding Lights', 'Cirrus', 'Tamally Maak', 'Li Beirut', 'Let It Happen'];
export const CITIES = ['Toronto', 'Montreal', 'Vancouver', 'Ottawa'];
export const NAMES = ['Omar', 'Layla', 'Sam', 'Nour', 'Jess', 'Karim', 'Dana', 'Youssef'];
export const INTERESTS = ['Technology', 'Real Estate', 'Electric Vehicles', 'Travel', 'Live Music', 'Cooking', 'Fitness', 'Startups', 'Photography', 'Soccer'];
export const UNRELATED_PATHS = ['photos/img_0001.jpg', 'documents/taxes_2023.pdf', 'readme.txt', 'backup/notes.md', 'random/data.bin'];
