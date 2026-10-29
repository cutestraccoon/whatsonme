import type { Event, Source } from '../types.js';
import { classify, classifyEvent, type Mood } from './lexicon.js';

export const ATTENTION_SOURCES: Source[] = ['instagram', 'tiktok', 'youtube', 'spotify', 'apple', 'x', 'snapchat', 'browser', 'steam', 'discord'];
const CONSUME = new Set(['watch', 'play', 'visit', 'session', 'ad_view']);
const ENGAGE = new Set(['like', 'save', 'share', 'comment', 'post', 'message', 'search', 'swipe', 'match', 'ad_click']);

export interface Cell { total: number; bySource: Record<string, number>; mood: Record<string, number> }
export interface Session { source: Source; start: number; end: number; count: number; moods: Record<string, number> }
export interface Attention {
  tz: string;
  grid: Cell[][];                      // [7 days Mon..Sun][24]
  likeGrid: Cell[][];
  moodByHour: Mood[];                  // dominant mood per hour
  totals: { consumed: number; engaged: number; bySource: Record<string, number> };
  peak: { label: string; share: number; hours: number[] };
  cleanHours: number[];
  longest: Session | null;
  sessions: Session[];
  workLeak: number;                    // share of consumption Mon-Fri 9-17
  nightShare: number;                  // share 22:00-02:00
  likeRate: Record<string, number>;    // source -> engaged/consumed
  facts: { k: string; v: string; note: string }[];
}

export function localParts(ts: number, tz: string) {
  // Intl.formatToParts is ~4µs a call; cache per 15-minute UTC bucket (every modern offset is a multiple of 15 min,
  // so day/hour/date are constant inside a bucket). Cuts a 500k-event pass from seconds to milliseconds.
  const key = Math.floor(ts / 900000); const cache = (lpCache[tz] ??= new Map());
  const hit = cache.get(key); if (hit) return hit;
  const f = fmt(tz); const p = f.formatToParts(new Date(key * 900000));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const wd = p.find((x) => x.type === 'weekday')?.value ?? 'Mon';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd.slice(0, 3));
  const out = { day: day < 0 ? 0 : day, hour: get('hour') % 24, y: get('year'), m: get('month'), d: get('day') };
  if (cache.size > 400_000) cache.clear();
  cache.set(key, out);
  return out;
}
const lpCache: Record<string, Map<number, { day: number; hour: number; y: number; m: number; d: number }>> = {};
const fmts: Record<string, Intl.DateTimeFormat> = {};
function fmt(tz: string) { return fmts[tz] ??= new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric' }); }

export function buildAttention(events: Event[], tz = 'UTC'): Attention {
  const mk = (): Cell[][] => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ total: 0, bySource: {}, mood: {} })));
  const grid = mk(), likeGrid = mk();
  const totals = { consumed: 0, engaged: 0, bySource: {} as Record<string, number> };
  const consumedBySrc: Record<string, number> = {}, engagedBySrc: Record<string, number> = {};
  const hourMood: Record<string, number>[] = Array.from({ length: 24 }, () => ({}));
  let workLeak = 0, night = 0, consumedWeek = 0;
  const perSource: Record<string, number[]> = {};
  for (const e of events) {
    if (!ATTENTION_SOURCES.includes(e.source)) continue;
    const isC = CONSUME.has(e.kind), isE = ENGAGE.has(e.kind); if (!isC && !isE) continue;
    const { day, hour } = localParts(e.ts, tz);
    const g = isC ? grid : likeGrid; const c = g[day][hour];
    c.total++; c.bySource[e.source] = (c.bySource[e.source] ?? 0) + 1;
    const { mood } = classifyEvent(e);
    if (mood !== 'Neutral') { c.mood[mood] = (c.mood[mood] ?? 0) + 1; hourMood[hour][mood] = (hourMood[hour][mood] ?? 0) + 1; }
    totals.bySource[e.source] = (totals.bySource[e.source] ?? 0) + 1;
    if (isC) { totals.consumed++; consumedBySrc[e.source] = (consumedBySrc[e.source] ?? 0) + 1; consumedWeek++; if (day < 5 && hour >= 9 && hour < 17) workLeak++; if (hour >= 22 || hour < 2) night++; (perSource[e.source] ??= []).push(e.ts); }
    else { totals.engaged++; engagedBySrc[e.source] = (engagedBySrc[e.source] ?? 0) + 1; }
  }
  // hour totals -> peak 3-hour window
  const hourTot = Array.from({ length: 24 }, (_, h) => grid.reduce((n, d) => n + d[h].total, 0));
  let best = 0, bestStart = 0; for (let h = 0; h < 24; h++) { const s = hourTot[h] + hourTot[(h + 1) % 24] + hourTot[(h + 2) % 24]; if (s > best) { best = s; bestStart = h; } }
  const peakHours = [bestStart, (bestStart + 1) % 24, (bestStart + 2) % 24];
  const peak = { label: `${pad(bestStart)}:00 – ${pad((bestStart + 3) % 24)}:00`, share: totals.consumed ? best / totals.consumed : 0, hours: peakHours };
  const cleanHours = hourTot.map((v, h) => (v <= Math.max(1, totals.consumed * 0.002) ? h : -1)).filter((h) => h >= 0);
  const moodByHour = hourMood.map((m) => (Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Neutral') as Mood);
  // sessions: gap > 20 min splits
  const sessions: Session[] = [];
  for (const [src, arr] of Object.entries(perSource)) { arr.sort((a, b) => a - b); let s: Session | null = null;
    for (const t of arr) { if (!s || t - s.end > 20 * 60000) { if (s) sessions.push(s); s = { source: src as Source, start: t, end: t, count: 1, moods: {} }; } else { s.end = t; s.count++; } }
    if (s) sessions.push(s); }
  // attach moods to sessions (second pass, cheap enough)
  const bySess = sessions.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const longest = bySess[0] ?? null;
  if (longest) for (const e of events) if (e.source === longest.source && e.ts >= longest.start && e.ts <= longest.end) { const { mood } = classifyEvent(e); if (mood !== 'Neutral') longest.moods[mood] = (longest.moods[mood] ?? 0) + 1; }
  const likeRate: Record<string, number> = {}; for (const s of Object.keys(consumedBySrc)) likeRate[s] = consumedBySrc[s] ? (engagedBySrc[s] ?? 0) / consumedBySrc[s] : 0;
  const topSrc = Object.entries(totals.bySource).sort((a, b) => b[1] - a[1])[0]?.[0];
  const facts = [
    { k: 'PEAK WINDOW', v: peak.label, note: `${Math.round(peak.share * 100)}% of everything you consume lands in these three hours${topSrc ? `, mostly on ${cap(topSrc)}` : ''}.` },
    longest ? { k: 'LONGEST SESSION', v: `${fmtDay(longest.start, tz)} · ${Math.round((longest.end - longest.start) / 60000)} min`, note: `${longest.count} items on ${cap(longest.source)}${topMood(longest.moods) ? `, mostly ${topMood(longest.moods)} content` : ''}.` } : { k: 'LONGEST SESSION', v: '—', note: 'Not enough timestamped data yet.' },
    { k: 'WORK-HOURS LEAK', v: `${Math.round((consumedWeek ? workLeak / consumedWeek : 0) * 100)}%`, note: 'Share of consumption Mon–Fri between 9 and 5.' },
    { k: 'CLEAN HOURS', v: cleanHours.length ? rangeLabel(cleanHours) : 'none', note: cleanHours.length ? 'The only hours no platform has you.' : 'Some platform has you at every hour of the day.' },
  ];
  return { tz, grid, likeGrid, moodByHour, totals, peak, cleanHours, longest, sessions, workLeak: consumedWeek ? workLeak / consumedWeek : 0, nightShare: consumedWeek ? night / consumedWeek : 0, likeRate, facts };
}

export function pad(n: number) { return String(n).padStart(2, '0'); }
export function cap(s: string) { return s === 'x' ? 'X' : s === 'tiktok' ? 'TikTok' : s === 'youtube' ? 'YouTube' : s.charAt(0).toUpperCase() + s.slice(1); }
function topMood(m: Record<string, number>) { return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0]; }
function fmtDay(ts: number, tz: string) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(ts)); }
function rangeLabel(hs: number[]) { const sorted = [...hs].sort((a, b) => a - b); const runs: [number, number][] = []; for (const h of sorted) { const r = runs[runs.length - 1]; if (r && h === r[1] + 1) r[1] = h; else runs.push([h, h]); } const r = runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]; return `${pad(r[0])}:00 – ${pad(r[1] + 1)}:00`; }
