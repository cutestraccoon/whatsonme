import type { Event } from '../types.js';
import { classify, classifyEvent, MOOD_ORDER, type Mood } from './lexicon.js';
import { localParts } from './attention.js';

export interface WeekMood { label: string; start: number; shares: Record<Mood, number>; n: number }
export interface Shift { when: string; mood: Mood; from: number; to: number; title: string; detail: string; cause: string }
export interface Era { name: string; mood: Mood; startMonth: string; endMonth: string; months: number; share: number; peakDay: string; chosenShare: number; note: string }

const TEXT_KINDS = new Set(['watch', 'search', 'like', 'save', 'play', 'visit']);

export function weeklyMood(events: Event[], tz: string, weeks = 12): WeekMood[] {
  const stamped = events.filter((e) => TEXT_KINDS.has(e.kind) && (e.title || e.actor));
  if (!stamped.length) return [];
  let last = -Infinity; for (const e of stamped) if (e.ts > last) last = e.ts; // no spread: 500k args overflows the call stack
  const W = 7 * 86400000; const start0 = last - weeks * W;
  const buckets: WeekMood[] = Array.from({ length: weeks }, (_, i) => ({ label: 'W' + (i + 1), start: start0 + i * W, shares: empty(), n: 0 }));
  for (const e of stamped) { if (e.ts < start0) continue; const i = Math.min(weeks - 1, Math.floor((e.ts - start0) / W)); const { mood } = classifyEvent(e); if (mood === 'Neutral') continue; buckets[i].shares[mood]++; buckets[i].n++; }
  for (const b of buckets) { if (b.n) for (const m of MOOD_ORDER) b.shares[m] = b.shares[m] / b.n; b.label = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(b.start)); }
  return buckets;
}

export function detectShifts(weeks: WeekMood[], events: Event[]): Shift[] {
  const out: Shift[] = [];
  for (let i = 2; i < weeks.length; i++) {
    const prev = avg(weeks.slice(Math.max(0, i - 3), i)); const cur = weeks[i]; if (cur.n < 10) continue;
    for (const m of MOOD_ORDER) { const d = cur.shares[m] - prev[m]; if (d > 0.18) {
      const searched = firstSearchFor(events, m, weeks[i - 1].start, cur.start + 7 * 86400000);
      out.push({ when: `${weeks[i - 1].label} → ${cur.label}`, mood: m, from: prev[m], to: cur.shares[m], title: `${m} jumps ${Math.round(prev[m] * 100)}% → ${Math.round(cur.shares[m] * 100)}%`,
        detail: describe(m, cur.shares[m]), cause: searched ? `You searched “${searched}” just before. The feed extended it.` : `No matching search found. This arrived through recommendations, not your own request.` }); } }
  }
  return dedupe(out).slice(0, 4);
}

export function buildEras(events: Event[], tz: string): Era[] {
  const stamped = events.filter((e) => TEXT_KINDS.has(e.kind) && (e.title || e.actor));
  const byMonth: Record<string, Record<string, { n: number; chosen: number; days: Record<string, number>; mood: Mood }>> = {};
  for (const e of stamped) { const p = localParts(e.ts, tz); const mk = `${p.y}-${String(p.m).padStart(2, '0')}`; const { topic, mood } = classifyEvent(e); if (topic === 'Other') continue;
    const slot = ((byMonth[mk] ??= {})[topic] ??= { n: 0, chosen: 0, days: {}, mood }); slot.n++; if (e.kind === 'search' || (e.meta && (e.meta as any).chosen)) slot.chosen++; const dk = `${mk}-${String(p.d).padStart(2, '0')}`; slot.days[dk] = (slot.days[dk] ?? 0) + 1; }
  const months = Object.keys(byMonth).sort();
  const eras: Era[] = [];
  for (const m of months) { const tot = Object.values(byMonth[m]).reduce((n, s) => n + s.n, 0); const [topic, s] = Object.entries(byMonth[m]).sort((a, b) => b[1].n - a[1].n)[0];
    const last = eras[eras.length - 1];
    const peak = Object.entries(s.days).sort((a, b) => b[1] - a[1])[0];
    if (last && last.name === topic) { last.endMonth = m; last.months++; last.share = (last.share + s.n / tot) / 2; if (peak && peak[1] > (last as any)._peakN) { last.peakDay = `${peak[0]} · ${peak[1]} items`; (last as any)._peakN = peak[1]; } }
    else { const era: any = { name: topic, mood: s.mood, startMonth: m, endMonth: m, months: 1, share: s.n / tot, peakDay: peak ? `${peak[0]} · ${peak[1]} items` : '—', chosenShare: s.n ? s.chosen / s.n : 0, note: '' , _peakN: peak?.[1] ?? 0 }; eras.push(era); }
  }
  for (const e of eras) { delete (e as any)._peakN; e.note = e.chosenShare >= 0.25 ? `${Math.round(e.chosenShare * 100)}% of this came from your own searches. You drove it.` : `Only ${Math.round(e.chosenShare * 100)}% came from your searches. The feed drove it.`; }
  return eras;
}

function empty(): Record<Mood, number> { return { Learn: 0, Aspire: 0, Comfort: 0, Doom: 0, Funny: 0, Social: 0, Neutral: 0 }; }
function avg(ws: WeekMood[]): Record<Mood, number> { const o = empty(); const n = ws.filter((w) => w.n).length || 1; for (const w of ws) for (const m of MOOD_ORDER) o[m] += w.shares[m] / n; return o; }
function firstSearchFor(events: Event[], mood: Mood, from: number, to: number) { for (const e of events) if (e.kind === 'search' && e.ts >= from && e.ts <= to && e.title && classifyEvent(e).mood === mood) return e.title; return null; }
function describe(m: Mood, share: number) { const pct = Math.round(share * 100); return ({ Learn: `Explainers and tutorials take ${pct}% of your watch time.`, Aspire: `Tours, reveals and unboxings reach ${pct}% of watch time. The feed is testing whether you buy.`, Comfort: `Music, cooking and gaming content at ${pct}%: a wind-down pattern.`, Doom: `Crash, layoff and outrage content hits ${pct}% of watch time. Sessions usually get longer, not shorter, when this happens.`, Funny: `Memes and skits at ${pct}%.`, Social: `Dating and relationship content at ${pct}%.`, Neutral: '' } as Record<Mood, string>)[m]; }
function dedupe(s: Shift[]) { const seen = new Set<string>(); return s.filter((x) => { const k = x.mood + x.when; if (seen.has(k)) return false; seen.add(k); return true; }); }
