import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStory } from '../components/useStory';
import type { Report, Wrapped as W } from '@bigbrother/core';
import type { Page } from '../App';

/* Spotify-Wrapped-style story: one reveal per slide, flat bold colours, tap / swipe / arrow keys, auto-advance. */

const C = { black: '#06080C', ink: '#F4F1EA', orange: '#FF7A1A', lime: '#C6F432', cyan: '#4CC9F0', purple: '#B47CFF', pink: '#FF5C8A', cream: '#F4F1EA' };
type Slide = { id: string; bg: string; fg: string; accent: string; body: (on: boolean) => ReactNode; ms?: number };

const H = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
const plat = (s: string) => (s === 'tiktok' ? 'TikTok' : s === 'youtube' ? 'YouTube' : s === 'x' ? 'X' : s.charAt(0).toUpperCase() + s.slice(1));
const host = (s: string) => s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

function useCount(to: number, on: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => { if (!on) { setV(0); return; } let raf = 0; const t0 = performance.now(); const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [to, on, ms]);
  return v;
}
function Count({ to, on, decimals = 0, suffix = '' }: { to: number; on: boolean; decimals?: number; suffix?: string }) { const v = useCount(to, on); return <>{v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</>; }

export function Wrapped({ report, go }: { report: Report; go: (p: Page) => void }) {
  const w = report.wrapped;
  const slides = useMemo(() => buildSlides(w, go), [w, go]);
  const exit = useCallback(() => go('dossier'), [go]);
  const st = useStory(slides.map((x) => x.ms ?? 6500), exit);
  const { i, elapsed, dur, paused } = st; const s = slides[i];

  return <div className="wr-stage" style={{ background: s.bg }} role="dialog" aria-modal="true" aria-label="Big Brother Wrapped">
    <div className="wr-phone" style={{ background: s.bg, color: s.fg }} {...st.handlers} role="region" aria-roledescription="story" aria-label={`Slide ${i + 1} of ${slides.length}`}>
      <div className="wr-bars" aria-hidden="true">{slides.map((_, k) => <div key={k} className="wr-bar" style={{ background: s.fg + '33' }}><div style={{ width: k < i ? '100%' : k > i ? '0%' : `${Math.min(100, (elapsed / dur) * 100)}%`, background: s.fg }} /></div>)}</div>
      <div className="wr-top"><span>BIG BROTHER <b style={{ color: s.fg, borderBottom: `3px solid ${s.accent}` }}>WRAPPED</b></span><button className="wr-x" style={{ color: s.fg }} onClick={exit} aria-label="Close story">✕</button></div>
      <Shapes id={s.id} color={s.accent} fg={s.fg} />
      <div key={s.id} className="wr-body" aria-live="polite">{s.body(true)}</div>
      {paused && <div className="wr-paused" style={{ color: s.fg }}>paused</div>}
    </div>
    <div className="wr-hint">tap right / left · hold to pause · ← → keys</div>
  </div>;
}

function Shapes({ id, color, fg }: { id: string; color: string; fg: string }) {
  const n = id.length; const a = (n * 37) % 360;
  return <div className="wr-shapes" aria-hidden="true">
    <div className="wr-blob b1" style={{ background: color, transform: `rotate(${a}deg)` }} />
    <div className="wr-blob b2" style={{ borderColor: fg + '55' }} />
    <div className="wr-blob b3" style={{ background: fg + '14' }} />
  </div>;
}

function buildSlides(w: W, go: (p: Page) => void): Slide[] {
  const S: Slide[] = [];
  S.push({ id: 'intro', bg: C.black, fg: C.ink, accent: C.orange, ms: 4500, body: () => <div className="wr-center">
    <p className="wr-kicker">{w.range ? (w.range.from === w.range.to ? w.range.from : `${w.range.from}–${w.range.to}`) : 'Your data'}</p>
    <h1 className="wr-huge">Your years,<br />as the <span style={{ color: C.orange }}>algorithm</span><br />saw them.</h1>
    <p className="wr-sub">Built only from your own data exports. Nothing left this device.</p>
    <p className="wr-tap">tap to start →</p></div> });
  if (w.hours > 0) S.push({ id: 'time', bg: C.orange, fg: C.black, accent: C.lime, body: (on) => <div className="wr-col">
    <p className="wr-kicker">You spent</p>
    <h1 className="wr-mega"><Count to={Math.round(w.hours)} on={on} /> hours</h1>
    <p className="wr-line">scrolling. That's <b>{w.fullDays.toFixed(1)} full days</b>, about {w.perDay < 1 ? `${Math.round(w.perDay * 60)} minutes` : `${w.perDay.toFixed(1)} hours`} on the days you open the apps.</p>
    <div className="wr-split">{w.platforms.map((p) => <div key={p.source}><div className="wr-split-bar" style={{ width: `${(p.hours / Math.max(...w.platforms.map((x) => x.hours))) * 100}%`, background: C.black }} /><span>{plat(p.source)} · {Math.round(p.hours)} h</span></div>)}</div></div> });
  S.push({ id: 'peak', bg: C.purple, fg: C.black, accent: C.lime, body: () => <div className="wr-center">
    <p className="wr-kicker">Your phone's favourite hour</p>
    <h1 className="wr-mega">{H(w.peakHour)}</h1>
    {w.lateNightsPerWeek >= 0.5 && <p className="wr-line">You're still scrolling after 1 AM about <b>{w.lateNightsPerWeek.toFixed(1)} nights a week</b>. Ad systems rate that window as when you resist least.</p>}</div> });
  if (w.longestMin > 30) S.push({ id: 'longest', bg: C.black, fg: C.ink, accent: C.cyan, body: (on) => <div className="wr-center">
    <p className="wr-kicker">Your longest sitting</p>
    <h1 className="wr-mega" style={{ color: C.cyan }}><Count to={Math.round(w.longestMin)} on={on} /> min</h1>
    <p className="wr-line">{w.longestWhen}. {w.longestMin > 180 ? 'Without a break longer than 20 minutes.' : ''}</p></div> });
  if (w.topTopics.length) S.push({ id: 'topics', bg: C.lime, fg: C.black, accent: C.purple, body: () => <div className="wr-col">
    <p className="wr-kicker">Your feed was mostly</p>
    <h1 className="wr-big">{w.topTopics[0].name}</h1>
    <ol className="wr-rank">{w.topTopics.map((t, k) => <li key={t.name} style={{ animationDelay: `${0.25 + k * 0.18}s` }}><span className="wr-n">{k + 1}</span><span className="wr-name">{t.name}</span><span className="wr-val">{t.pct}%</span></li>)}</ol>
    <p className="wr-foot">from captions and hashtags of what you watched, liked and saved</p></div> });
  if (w.topAccounts.length >= 3) S.push({ id: 'accounts', bg: C.cyan, fg: C.black, accent: C.orange, body: () => <div className="wr-col">
    <p className="wr-kicker">Your top accounts</p>
    <ol className="wr-rank big">{w.topAccounts.map((a, k) => <li key={a.name} style={{ animationDelay: `${0.2 + k * 0.2}s` }}><span className="wr-n">{k + 1}</span><span className="wr-name">@{a.name}</span><span className="wr-val">{a.n}</span></li>)}</ol>
    <p className="wr-foot">times they showed up in what you watched, liked or saved</p></div> });
  if (w.topTags.length >= 4) S.push({ id: 'tags', bg: C.pink, fg: C.black, accent: C.lime, body: () => <div className="wr-col">
    <p className="wr-kicker">Your year in hashtags</p>
    <div className="wr-tags">{w.topTags.map((t, k) => <span key={t} style={{ animationDelay: `${0.15 + k * 0.12}s`, fontSize: `${Math.max(22, 46 - k * 3)}px` }}>{t}</span>)}</div></div> });
  if (w.watched > 50) S.push({ id: 'choose', bg: C.black, fg: C.ink, accent: C.orange, body: (on) => <div className="wr-center">
    <p className="wr-kicker">You watched <b>{w.watched.toLocaleString()}</b> things</p>
    <h1 className="wr-mega" style={{ color: C.orange }}><Count to={Math.round(w.chosenRate * 100)} on={on} />%</h1>
    <p className="wr-line">is how much of it you actually liked, saved or commented on.<br /><b>The feed chose the other {100 - Math.round(w.chosenRate * 100)}%.</b></p></div> });
  if (w.aiNotes.length) S.push({ id: 'ai', bg: C.purple, fg: C.black, accent: C.cream, ms: 8000, body: () => <div className="wr-col">
    <p className="wr-kicker">Meta's AI keeps notes on you. They say:</p>
    <div className="wr-quotes">{w.aiNotes.slice(0, 6).map((n, k) => <q key={n + k} style={{ animationDelay: `${0.2 + k * 0.35}s` }}>The user might be interested in <b>{n}</b></q>)}</div>
    <p className="wr-foot">word for word, from your Instagram export</p></div> });
  if (w.segments.length) S.push({ id: 'segments', bg: C.orange, fg: C.black, accent: C.purple, ms: 7500, body: () => <div className="wr-col">
    <p className="wr-kicker">To advertisers, Meta sells you as</p>
    <div className="wr-chips">{w.segments.map((s, k) => <span key={s + k} style={{ animationDelay: `${0.15 + k * 0.15}s` }}>{s}</span>)}</div></div> });
  if (w.advertisers) S.push({ id: 'advertisers', bg: C.black, fg: C.ink, accent: C.pink, body: (on) => <div className="wr-col">
    <h1 className="wr-mega" style={{ color: C.pink }}><Count to={w.advertisers} on={on} /></h1>
    <p className="wr-line">companies uploaded a list with your email or phone number, and Meta matched it to you.</p>
    <ul className="wr-mini">{w.topIndustries.map((i) => <li key={i.name}><span>{i.name}</span><b>{i.n}</b></li>)}</ul></div> });
  if (w.topPartner) S.push({ id: 'partner', bg: C.lime, fg: C.black, accent: C.orange, body: (on) => <div className="wr-col">
    <p className="wr-kicker">Biggest snitch</p>
    <h1 className="wr-big">{host(w.topPartner!.name)}</h1>
    <p className="wr-line">told {w.topPartner!.to} about you <b><Count to={w.topPartner!.events} on={on} /> times</b>{w.topPartner!.what ? `: ${w.topPartner!.what.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}` : ''}.</p>
    {w.partners > 1 && <p className="wr-foot">{w.partners - 1} other apps and sites did the same</p>}</div> });
  if (w.messages > 100) S.push({ id: 'circle', bg: C.cyan, fg: C.black, accent: C.purple, body: (on) => <div className="wr-col">
    <p className="wr-kicker">Your inner circle</p>
    <h1 className="wr-mega"><Count to={Math.round(w.innerShare * 100)} on={on} />%</h1>
    <p className="wr-line">of your {w.messages.toLocaleString()} messages went to just {Math.min(5, w.chats)} of your {w.chats} chats. The platform knows exactly who they are.</p>
    <ol className="wr-rank">{w.topChats.map((c, k) => <li key={c.name} style={{ animationDelay: `${0.3 + k * 0.2}s` }}><span className="wr-n">{k + 1}</span><span className="wr-name">{c.name}</span><span className="wr-val">{c.n.toLocaleString()}</span></li>)}</ol></div> });
  if (w.searches.length >= 3) S.push({ id: 'search', bg: C.pink, fg: C.black, accent: C.cyan, ms: 7500, body: () => <div className="wr-col">
    <p className="wr-kicker">Your searches said it all</p>
    <div className="wr-search">{w.searches.slice(0, 7).map((q, k) => <div key={q + k} style={{ animationDelay: `${0.2 + k * 0.3}s` }}><span aria-hidden="true">⌕</span> {q}</div>)}</div>
    <p className="wr-foot">{w.searchCount} searches on file. Searches are intent, the strongest signal you give.</p></div> });
  if (w.notInterested > 20) S.push({ id: 'nope', bg: C.black, fg: C.ink, accent: C.lime, body: (on) => <div className="wr-center">
    <p className="wr-kicker">You said “not interested”</p>
    <h1 className="wr-mega" style={{ color: C.lime }}><Count to={w.notInterested} on={on} /> times</h1>
    <p className="wr-line">Instagram kept every one. Rejections shape your profile too.</p></div> });
  S.push({ id: 'type', bg: C.orange, fg: C.black, accent: C.black, ms: 8000, body: () => <div className="wr-center">
    <p className="wr-kicker">Your algorithm type</p>
    <h1 className="wr-big">{w.archetype.name}</h1>
    <p className="wr-line">{w.archetype.line}</p>
    <div className="wr-chips center">{w.archetype.traits.map((t) => <span key={t}>{t}</span>)}</div></div> });
  S.push({ id: 'summary', bg: C.black, fg: C.ink, accent: C.orange, body: () => <Summary w={w} go={go} /> });
  return S;
}

function Summary({ w, go }: { w: W; go: (p: Page) => void }) {
  const [withAccounts, setWithAccounts] = useState(false);
  const download = (b: Blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'big-brother-wrapped.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const save = () => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; drawSummary(c, w, withAccounts); c.toBlob((b) => { if (!b) return; const f = new File([b], 'big-brother-wrapped.png', { type: 'image/png' }); const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }; if (nav.canShare?.({ files: [f] })) nav.share({ files: [f] }).catch((e: unknown) => { if ((e as Error)?.name !== 'AbortError') download(b); }); else download(b); }, 'image/png'); };
  return <div className="wr-col wr-summary">
    <p className="wr-kicker" style={{ color: C.orange }}>{w.archetype.name}</p>
    <div className="wr-grid">
      <div><span>Top topics</span><ol>{w.topTopics.slice(0, 5).map((t) => <li key={t.name}>{t.name}</li>)}</ol></div>
      <div><span>Top accounts</span><ol>{w.topAccounts.slice(0, 5).map((a) => <li key={a.name}>@{a.name}</li>)}</ol></div>
      <div><span>Hours scrolling</span><b>{Math.round(w.hours)}</b></div>
      <div><span>Favourite hour</span><b>{H(w.peakHour)}</b></div>
      <div><span>Companies with your info</span><b>{w.advertisers.toLocaleString()}</b></div>
      <div><span>You chose</span><b>{Math.round(w.chosenRate * 100)}%</b></div>
    </div>
    {w.topAccounts.length > 0 && <label className="wr-opt"><input type="checkbox" checked={withAccounts} onChange={(e) => setWithAccounts(e.target.checked)} /> Include my top accounts (@handles) in the image</label>}
    <div className="wr-actions"><button className="wr-btn" style={{ background: C.orange, color: C.black }} onClick={save}>Save / share image</button><button className="wr-btn ghost" onClick={() => go('dossier')}>See your full file</button><button className="wr-btn ghost" onClick={() => go('flows')}>Who has your data</button></div>
    <p className="wr-foot">The saved image never includes names of people you message, your location or your contact details. Account handles are off unless you tick the box.</p>
  </div>;
}

function drawSummary(c: HTMLCanvasElement, w: W, withAccounts = false) {
  const x = c.getContext('2d')!; const W_ = c.width, H_ = c.height;
  x.fillStyle = C.black; x.fillRect(0, 0, W_, H_);
  x.fillStyle = C.orange; x.beginPath(); x.arc(W_ - 30, 60, 190, 0, Math.PI * 2); x.fill();
  x.fillStyle = C.purple; x.beginPath(); x.arc(W_ - 40, H_ - 330, 130, 0, Math.PI * 2); x.fill();
  const sans = (s: number, wt = 800) => `${wt} ${s}px "Space Grotesk", system-ui, sans-serif`;
  x.fillStyle = C.ink; x.font = sans(34, 700); x.fillText('BIG BROTHER WRAPPED', 72, 110);
  x.fillStyle = C.ink; x.font = sans(30, 500); x.fillText('My algorithm type', 72, 330);
  x.font = sans(84); wrap(x, w.archetype.name, 72, 430, W_ - 160, 92);
  const col = (lx: number, y: number, title: string, items: string[]) => { x.fillStyle = '#9AA3B2'; x.font = sans(28, 600); x.fillText(title, lx, y); x.fillStyle = C.ink; x.font = sans(36, 700); items.slice(0, 5).forEach((t, k) => { let s = `${k + 1}  ${t}`; while (x.measureText(s).width > 450 && s.length > 4) s = s.slice(0, -2); if (s !== `${k + 1}  ${t}`) s = s.trimEnd() + '…'; x.fillText(s, lx, y + 66 + k * 58); }); };
  col(72, 760, 'Top topics', w.topTopics.map((t) => t.name)); if (withAccounts && w.topAccounts.length) col(560, 760, 'Top accounts', w.topAccounts.map((a) => '@' + a.name)); else if (w.topTags.length >= 3) col(560, 760, 'Hashtags', w.topTags); else col(560, 760, 'Where it went', w.platforms.map((p) => `${plat(p.source)} · ${Math.round(p.hours)} h`));
  const stat = (lx: number, y: number, label: string, v: string, color: string) => { x.fillStyle = '#9AA3B2'; x.font = sans(28, 600); x.fillText(label, lx, y); x.fillStyle = color; x.font = sans(86); x.fillText(v, lx, y + 92); };
  stat(72, 1170, 'Hours scrolling', String(Math.round(w.hours)), C.orange); stat(560, 1170, 'Favourite hour', H(w.peakHour), C.cyan);
  stat(72, 1400, 'Companies with my info', w.advertisers.toLocaleString(), C.pink); stat(560, 1400, 'I actually chose', `${Math.round(w.chosenRate * 100)}%`, C.lime);
  x.fillStyle = C.ink; x.font = sans(32, 600); x.fillText('What did the algorithm decide you are?', 72, H_ - 120);
}
function wrap(x: CanvasRenderingContext2D, t: string, px: number, py: number, mw: number, lh: number) { const ws = t.split(' '); let line = ''; let y = py; for (const w of ws) { const tt = line ? line + ' ' + w : w; if (x.measureText(tt).width > mw && line) { x.fillText(line, px, y); line = w; y += lh; } else line = tt; } if (line) x.fillText(line, px, y); }
