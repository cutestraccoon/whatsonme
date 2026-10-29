import type { Claim, Event } from '../types.js';
import { localParts } from './attention.js';

/** Social-graph and behaviour insights from one platform's likes, saves, comments, DMs, story taps, in-app browsing. */
export interface SocialReport {
  source: string;
  span: { from: string; to: string; days: number } | null;
  likes: { total: number; perWeek: number; top: { actor: string; n: number; share: number }[]; concentration: number; byHour: number[]; byWeekday: number[]; streak: { days: number; start: string } | null };
  saves: { total: number; top: { actor: string; n: number }[] };
  comments: { total: number; top: { actor: string; n: number }[] };
  dms: { total: number; sent: number; received: number; threads: number; top: { thread: string; n: number; sentShare: number; medianReplyMin: number | null; firstMover: 'you' | 'them' | 'even' }[]; nightShare: number; byHour: number[]; avgLen: number; mediaShare: number } | null;
  story: { total: number; byKind: { kind: string; n: number }[]; topAccounts: { actor: string; n: number }[] };
  links: { total: number; topDomains: { domain: string; n: number }[]; byHour: number[]; shopping: number } | null;
  shopping: { items: number; merchants: { actor: string; n: number }[] } | null;
  searches: { total: number; accounts: number; phrases: number; recent: string[] };
  watched: { total: number; days: number; perDay: number; topAuthors: { actor: string; n: number }[]; note: string } | null;
  ads: { seen: number; clicked: number; ctr: number; topAdvertisers: { actor: string; n: number }[] };
  facts: { k: string; v: string; note: string }[];
}

export function buildSocial(all: Event[], claims: Claim[], tz: string, source = 'instagram'): SocialReport | null {
  const ev = all.filter((e) => e.source === source);
  if (ev.length < 20) return null;
  const top = (xs: Event[], key: (e: Event) => string | undefined, n = 8) => { const m: Record<string, number> = {}; for (const e of xs) { const k = key(e); if (k) m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([actor, c]) => ({ actor, n: c })); };
  const hours = (xs: Event[]) => { const h = Array(24).fill(0); for (const e of xs) h[localParts(e.ts, tz).hour]++; return h; };
  const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const ts = ev.map((e) => e.ts); const from = Math.min(...ts), to = Math.max(...ts);
  const days = Math.max(1, Math.round((to - from) / 86400000));

  const likes = ev.filter((e) => e.kind === 'like');
  const likeTop = top(likes, (e) => e.actor, 10).map((t) => ({ ...t, share: likes.length ? t.n / likes.length : 0 }));
  const concentration = likeTop.slice(0, 5).reduce((n, t) => n + t.share, 0);
  const byWeekday = Array(7).fill(0); for (const e of likes) byWeekday[localParts(e.ts, tz).day]++;
  let streak: SocialReport['likes']['streak'] = null;
  { const ds = [...new Set(likes.map((e) => day(e.ts)))].sort(); let best = 0, cur = 0, bestStart = '', curStart = ''; for (let i = 0; i < ds.length; i++) { if (i && Date.parse(ds[i]) - Date.parse(ds[i - 1]) === 86400000) cur++; else { cur = 1; curStart = ds[i]; } if (cur > best) { best = cur; bestStart = curStart; } } if (best >= 3) streak = { days: best, start: bestStart }; }

  const saves = ev.filter((e) => e.kind === 'save'); const comments = ev.filter((e) => e.kind === 'comment');

  const msgs = ev.filter((e) => e.kind === 'message'); let dms: SocialReport['dms'] = null;
  if (msgs.length) {
    const byThread: Record<string, Event[]> = {}; for (const m of msgs) (byThread[m.title ?? '?'] ??= []).push(m);
    const known = msgs.some((m) => m.meta?.from_me != null);
    const threads = Object.entries(byThread).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([thread, ms]) => {
      ms.sort((a, b) => a.ts - b.ts); const sent = ms.filter((m) => m.meta?.from_me).length;
      const gaps: number[] = []; let starts = { you: 0, them: 0 };
      for (let i = 1; i < ms.length; i++) { const a = ms[i - 1], b = ms[i]; const gap = b.ts - a.ts; if (gap > 6 * 3600000) { if (known) (b.meta?.from_me ? starts.you++ : starts.them++); continue; } if (known && !!a.meta?.from_me !== !!b.meta?.from_me && !b.meta?.from_me === false) gaps.push(gap); }
      gaps.sort((x, y) => x - y); const med = gaps.length >= 5 ? gaps[Math.floor(gaps.length / 2)] / 60000 : null;
      return { thread, n: ms.length, sentShare: known ? sent / ms.length : 0, medianReplyMin: med, firstMover: !known || starts.you === starts.them ? 'even' as const : starts.you > starts.them ? 'you' as const : 'them' as const };
    });
    const night = msgs.filter((m) => { const h = localParts(m.ts, tz).hour; return h >= 0 && h < 4; }).length;
    dms = { total: msgs.length, sent: msgs.filter((m) => m.meta?.from_me).length, received: known ? msgs.filter((m) => !m.meta?.from_me).length : 0, threads: Object.keys(byThread).length, top: threads, nightShare: night / msgs.length, byHour: hours(msgs), avgLen: Math.round(msgs.reduce((n, m) => n + (m.value ?? 0), 0) / msgs.length), mediaShare: msgs.filter((m) => m.meta?.media).length / msgs.length };
  }

  const storyEv = ev.filter((e) => String(e.meta?.what ?? '').startsWith('story_'));
  const story = { total: storyEv.length, byKind: top(storyEv, (e) => String(e.meta?.what).replace('story_', ''), 8).map((t) => ({ kind: t.actor, n: t.n })), topAccounts: top(storyEv, (e) => e.actor, 6) };

  const linkEv = ev.filter((e) => e.kind === 'visit' && e.meta?.via === 'in-app-browser');
  const links = linkEv.length ? { total: linkEv.length, topDomains: top(linkEv, (e) => { try { return new URL(e.url ?? '').hostname.replace(/^www\./, ''); } catch { return undefined; } }, 10).map((t) => ({ domain: t.actor, n: t.n })), byHour: hours(linkEv), shopping: linkEv.filter((e) => /shop|store|amazon|checkout|product|buy|cart/i.test(e.url ?? '')).length } : null;
  const shopEv = ev.filter((e) => e.meta?.what === 'product'); const shopping = shopEv.length ? { items: shopEv.length, merchants: top(shopEv, (e) => e.actor, 6) } : null;

  const searches = ev.filter((e) => e.kind === 'search');
  const searchOut = { total: searches.length, accounts: searches.filter((s) => /^[a-z0-9_.]{2,30}$/i.test(s.title ?? '') && !/\s/.test(s.title ?? '')).length, phrases: 0, recent: searches.slice(-8).reverse().map((s) => s.title ?? '').filter(Boolean) }; searchOut.phrases = searchOut.total - searchOut.accounts;

  const watched = ev.filter((e) => e.kind === 'watch'); let watchedOut: SocialReport['watched'] = null;
  if (watched.length) { const wd = new Set(watched.map((e) => day(e.ts))).size; watchedOut = { total: watched.length, days: wd, perDay: Math.round(watched.length / Math.max(1, wd)), topAuthors: top(watched, (e) => e.actor, 8), note: wd <= 21 ? `Instagram only exports roughly the last ${wd} days of what you watched. Likes and saves go back years.` : '' }; }

  const adsSeen = ev.filter((e) => e.kind === 'ad_view'), adsClicked = ev.filter((e) => e.kind === 'ad_click');
  const ads = { seen: adsSeen.length, clicked: adsClicked.length, ctr: adsSeen.length ? adsClicked.length / adsSeen.length : 0, topAdvertisers: top(adsSeen, (e) => e.actor, 6) };

  const facts: SocialReport['facts'] = [];
  if (likes.length) facts.push({ k: 'LIKES', v: `${likes.length.toLocaleString()} · ${(likes.length / (days / 7)).toFixed(1)} per week`, note: likeTop[0] ? `${Math.round(concentration * 100)}% of your likes go to 5 accounts. Top: ${likeTop[0].actor} (${likeTop[0].n}).` : '' });
  if (dms) facts.push({ k: 'DMS', v: `${dms.total.toLocaleString()} messages · ${dms.threads} chats`, note: `${Math.round(dms.nightShare * 100)}% sent between midnight and 4 am${dms.top[0] ? `. Busiest chat: ${dms.top[0].thread} (${dms.top[0].n})` : ''}.` });
  if (links) facts.push({ k: 'IN-APP BROWSER', v: `${links.total.toLocaleString()} links opened`, note: `Instagram keeps a history of every link you tap. Top site: ${links.topDomains[0]?.domain ?? '—'}. ${links.shopping} look like shopping.` });
  if (story.total) facts.push({ k: 'STORY TAPS', v: `${story.total.toLocaleString()}`, note: `Polls, quizzes, sliders and story likes are all logged${story.topAccounts[0] ? `, most with ${story.topAccounts[0].actor}` : ''}.` });
  if (ads.seen) facts.push({ k: 'ADS', v: `${ads.seen.toLocaleString()} seen · ${ads.clicked} clicked`, note: `Click-through ${(ads.ctr * 100).toFixed(1)}%. Most shown: ${ads.topAdvertisers[0]?.actor ?? '—'}.` });
  if (streak) facts.push({ k: 'LONGEST LIKE STREAK', v: `${streak.days} days`, note: `Starting ${streak.start}. Daily likes are the feed's strongest “keep showing this” signal.` });

  return { source, span: { from: day(from), to: day(to), days }, likes: { total: likes.length, perWeek: likes.length / (days / 7), top: likeTop, concentration, byHour: hours(likes), byWeekday, streak }, saves: { total: saves.length, top: top(saves, (e) => e.actor, 6) }, comments: { total: comments.length, top: top(comments, (e) => e.actor, 6) }, dms, story, links, shopping, searches: searchOut, watched: watchedOut, ads, facts };
}
