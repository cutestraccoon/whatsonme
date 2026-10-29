import type { Claim, Event } from '../types.js';
import { classifyEvent } from './lexicon.js';
import { localParts, cap } from './attention.js';
import type { Flows, Habits } from './story.js';

/** Data for the Wrapped-style story. Every field is optional in spirit: slides only render when their data exists. */
export interface Wrapped {
  range: { from: string; to: string } | null;
  hours: number; fullDays: number; perDay: number; peakHour: number; lateNightsPerWeek: number; longestMin: number; longestWhen: string;
  platforms: { source: string; hours: number }[];
  topTopics: { name: string; pct: number }[];
  topAccounts: { name: string; n: number }[];
  topTags: string[];
  aiNotes: string[]; segments: string[];
  advertisers: number; topIndustries: { name: string; n: number }[];
  topPartner: { name: string; to: string; events: number; what: string } | null; partners: number;
  messages: number; chats: number; topChats: { name: string; n: number }[]; innerShare: number;
  searches: string[]; searchCount: number;
  chosenRate: number; watched: number;
  notInterested: number;
  archetype: { name: string; line: string; traits: string[] };
}

const GENERIC = /^(reels?|fyp|foryou|foryoupage|explore|explorepage|viral|viralvideos?|trending|instagram|instagood|reelsinstagram|tiktok|video|love|like|follow)$/i;

export function buildWrapped(events: Event[], claims: Claim[], habits: Habits, flows: Flows, tz: string): Wrapped {
  const ts = events.map((e) => e.ts).filter((t) => t > Date.UTC(2005, 0, 1)); ts.sort((a, b) => a - b);
  const content = events.filter((e) => ['watch', 'like', 'save'].includes(e.kind) && (e.title || e.meta?.tags));
  const tc: Record<string, number> = {}; for (const e of content) { const { topic } = classifyEvent(e); if (topic !== 'Other') tc[topic] = (tc[topic] ?? 0) + 1; }
  const tTotal = Object.values(tc).reduce((a, b) => a + b, 0) || 1;
  const topTopics = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, pct: Math.round((n / tTotal) * 100) }));
  const acc: Record<string, number> = {}; for (const e of events) if (['watch', 'like', 'save'].includes(e.kind) && e.actor && e.meta?.what !== 'suggested_account' && /^[\w.]{2,30}$/.test(e.actor)) acc[e.actor] = (acc[e.actor] ?? 0) + 1;
  const topAccounts = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n }));
  const tags: Record<string, number> = {}; for (const e of content) for (const t of String(e.meta?.tags ?? '').split(' ').filter(Boolean)) if (!GENERIC.test(t)) tags[t.toLowerCase()] = (tags[t.toLowerCase()] ?? 0) + 1;
  const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => '#' + k);
  const msgs = events.filter((e) => e.kind === 'message' && !e.meta?.request);
  const th: Record<string, number> = {}; for (const m of msgs) if (m.title) th[m.title] = (th[m.title] ?? 0) + 1;
  const chats = Object.entries(th).sort((a, b) => b[1] - a[1]);
  const searches = events.filter((e) => e.kind === 'search' && e.title).sort((a, b) => b.ts - a.ts);
  const tp = flows.partners.find((p) => p.named);
  const peak = habits.typicalDay.reduce((b, x) => (x.perDay > b.perDay ? x : b), habits.typicalDay[0] ?? { hour: 0, perDay: 0 });
  // late-night share across all activity
  const act = events.filter((e) => ['watch', 'like', 'save', 'message', 'search', 'comment'].includes(e.kind)); let late = 0; for (const e of act) { const h = localParts(e.ts, tz).hour; if (h < 4) late++; }
  const lateShare = act.length ? late / act.length : 0;
  const archetype = pickArchetype({ lateShare, chosen: habits.chosen.rate, topTopic: topTopics[0]?.name, inner: chats.length ? chats.slice(0, 5).reduce((n, [, v]) => n + v, 0) / Math.max(1, msgs.length) : 0, perDay: habits.hoursPerDay, searches: searches.length });
  return {
    range: ts.length ? { from: new Date(ts[0]).getFullYear().toString(), to: new Date(ts[ts.length - 1]).getFullYear().toString() } : null,
    hours: habits.hoursTotal, fullDays: habits.hoursTotal / 24, perDay: habits.hoursPerDay, peakHour: peak.hour, lateNightsPerWeek: habits.sessions.lateNightsPerWeek, longestMin: habits.sessions.longestMin, longestWhen: habits.sessions.longestWhen,
    platforms: habits.perSource.map((p) => ({ source: p.source, hours: p.hours })),
    topTopics, topAccounts, topTags,
    aiNotes: [...new Set(claims.filter((c) => c.field === 'ai_interest').map((c) => c.value))].slice(0, 8),
    segments: [...new Set(claims.filter((c) => c.field === 'ad_category').map((c) => c.value.trim()).filter((v) => !/facebook access|browser|devices|operating/i.test(v)))].slice(0, 8),
    advertisers: flows.advertisers.total, topIndustries: flows.advertisers.industries.filter((i) => !i.name.startsWith('Other')).slice(0, 4).map((i) => ({ name: i.name, n: i.n })),
    topPartner: tp ? { name: tp.name, to: tp.to, events: tp.events, what: tp.types.slice(0, 3).join(', ') } : null, partners: flows.partnerTotal,
    messages: msgs.length, chats: chats.length, topChats: chats.slice(0, 3).map(([name, n]) => ({ name, n })), innerShare: msgs.length ? chats.slice(0, 5).reduce((n, [, v]) => n + v, 0) / msgs.length : 0,
    searches: searches.slice(0, 8).map((s) => s.title!), searchCount: searches.length,
    chosenRate: habits.chosen.rate, watched: habits.chosen.consumed,
    notInterested: events.filter((e) => e.meta?.what === 'not_interested').length,
    archetype,
  };
}

function pickArchetype(x: { lateShare: number; chosen: number; topTopic?: string; inner: number; perDay: number; searches: number }): Wrapped['archetype'] {
  const traits: string[] = [];
  const night = x.lateShare > 0.15; const lurker = x.chosen < 0.05; const heavy = x.perDay > 1.5; const tight = x.inner > 0.45; const seeker = x.searches > 80;
  if (night) traits.push('Night owl'); if (lurker) traits.push('Silent watcher'); if (heavy) traits.push('Heavy scroller'); if (tight) traits.push('Small inner circle'); if (seeker) traits.push('Searcher');
  const noun: Record<string, string> = { Sports: 'Sports Fan', 'Comedy & memes': 'Meme Collector', Travel: 'Daydream Traveller', 'Arab & Middle East culture': 'Diaspora Kid', 'Fitness & health': 'Gym Rat', 'Cooking & food': 'Foodie', 'AI & tech': 'Tech Head', Music: 'Music Head', 'Real estate & property': 'Property Hunter', 'Finance & investing': 'Market Watcher', 'Cars & EVs': 'Car Guy', Gaming: 'Gamer', 'Spirituality & religion': 'Seeker', 'Podcasts & interviews': 'Podcast Brain', 'Documentaries & explainers': 'Explainer Addict' };
  const n = (x.topTopic && noun[x.topTopic]) || 'Scroller';
  const adj = night && lurker ? 'Midnight Lurker' : night ? 'Night-Owl' : lurker ? 'Silent' : heavy ? 'Always-On' : tight ? 'Loyal' : 'Curious';
  const name = `The ${adj} ${n}`;
  const line = [night && 'You do your best scrolling after midnight', lurker && 'you watch everything and like almost nothing', tight && 'and you save your words for a handful of people'].filter(Boolean).join(', ') || `Your feed runs on ${x.topTopic?.toLowerCase() ?? 'variety'}`;
  return { name, line: line.charAt(0).toUpperCase() + line.slice(1) + '.', traits };
}
export { cap };
