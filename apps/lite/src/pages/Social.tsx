import { useState } from 'react';
import type { Report, SocialReport } from '@bigbrother/core';
import { cap, DAYS, pad } from '../components/Eye';
import { Hero } from '../components/Hero';

/** Per-platform deep dive: who you like, who you talk to, what you tap, what you open. */
export function Social({ report: r }: { report: Report }) {
  const [i, setI] = useState(0); const s: SocialReport | undefined = r.social[i];
  if (!s) return <main className="readable"><Hero tone="cyan" accent="orange" title="No social data yet." lead="Add an Instagram, TikTok, X or Snapchat export." /></main>;
  const Bars = ({ v, label }: { v: number[]; label: string }) => { const mx = Math.max(1, ...v); return <div role="img" aria-label={label} style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>{v.map((n, k) => <div key={k} title={`${pad(k)}:00 · ${n}`} style={{ flex: 1, height: `${Math.max(2, (n / mx) * 100)}%`, borderRadius: '2px 2px 0 0', background: n / mx >= 0.7 ? '#FF7A1A' : '#E4DFD3' }} />)}</div>; };
  const List = ({ rows, unit }: { rows: { actor?: string; thread?: string; domain?: string; kind?: string; n: number }[]; unit?: string }) => { const mx = Math.max(1, ...rows.map((x) => x.n)); return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{rows.map((x, k) => { const name = x.actor ?? x.thread ?? x.domain ?? x.kind ?? '?'; return <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, gap: 8, fontWeight: 600 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span><span className="mono" style={{ color: '#FF7A1A' }}>{x.n}{unit ? ' ' + unit : ''}</span></div><div className="bar"><div style={{ width: `${(x.n / mx) * 100}%` }} /></div></div>; })}</div>; };
  const weekdayMax = Math.max(1, ...s.likes.byWeekday);
  const TONES = ['t-orange', 't-lime', 't-cyan', 't-pink', 't-purple', 't-ink'];
  return <main className="readable">
    <Hero tone="cyan" accent="orange" kicker={`${cap(s.source)} deep dive${s.span ? ` · ${s.span.from} → ${s.span.to}` : ''}`}
      title={s.likes.total ? <>You liked <span style={{ color: '#F4F1EA' }}>{s.likes.total.toLocaleString()}</span> things. {Math.round(s.likes.concentration * 100)}% went to five accounts.</> : <>Your {cap(s.source)} file, decoded.</>}>
      {r.social.length > 1 && <div className="pills">{r.social.map((x, k) => <button key={x.source} className={'pill' + (k === i ? ' on' : '')} onClick={() => setI(k)}>{cap(x.source)}</button>)}</div>}
    </Hero>
    <section className="grid g3">{s.facts.map((f, k) => <div key={f.k} className={'kpi ' + TONES[k % TONES.length]}><span className="v" style={{ fontSize: 26 }}>{f.v}</span><span className="k"><b>{f.k}</b> · {f.note}</span></div>)}</section>

    {s.watched && <section className="sec"><div className="sec-h"><h2>What you watched</h2><span className="sub">{s.watched.total.toLocaleString()} items over {s.watched.days} days · ~{s.watched.perDay}/day</span></div>
      {s.watched.note && <div className="warn">{s.watched.note}</div>}
      <div className="grid g2"><div className="card"><h3>Accounts you watch most</h3><div style={{ height: 12 }} /><List rows={s.watched.topAuthors} /></div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><h3>Why it's thin</h3><p className="what">Instagram's export lists only the author and time of each Reel or post you watched, never the content, and only for a short recent window. To see <em>what</em> you watched, use the likes and saves below (they carry links), or run the Desktop enrichment step that fetches captions for your liked posts with your own login.</p></div></div></section>}

    <section className="sec"><div className="sec-h"><h2>Who you like</h2><span className="sub">{s.likes.total.toLocaleString()} likes · {s.likes.perWeek.toFixed(1)}/week</span></div>
      <div className="grid g3">
        <div className="card"><h3>Like leaderboard</h3><div style={{ height: 12 }} /><List rows={s.likes.top} /></div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>By hour</h3><Bars v={s.likes.byHour} label="Likes by hour" /><div className="legend" style={{ justifyContent: 'space-between' }}><span className="mono">00</span><span className="mono">12</span><span className="mono">23</span></div><h3>By weekday</h3><div style={{ display: 'flex', gap: 6 }}>{s.likes.byWeekday.map((n, k) => <div key={k} style={{ flex: 1, textAlign: 'center' }}><div style={{ height: 40, display: 'flex', alignItems: 'flex-end' }}><div style={{ width: '100%', height: `${(n / weekdayMax) * 100}%`, background: '#4CC9F0', borderRadius: 3 }} /></div><span style={{ fontSize: 10, color: '#8A867B', fontWeight: 700 }}>{DAYS[k]}</span></div>)}</div></div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div><h3>Saved</h3><div style={{ height: 10 }} />{s.saves.total ? <List rows={s.saves.top} /> : <span className="sub">none</span>}</div><div><h3>Commented on</h3><div style={{ height: 10 }} />{s.comments.total ? <List rows={s.comments.top} /> : <span className="sub">none</span>}</div></div>
      </div></section>

    {s.dms && <section className="sec"><div className="sec-h"><h2>Who you talk to</h2><span className="sub">{s.dms.total.toLocaleString()} messages · {s.dms.threads} chats · content never read, only counted</span></div>
      <div className="grid g2">
        <div className="card"><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Chat</th><th>Msgs</th><th>You sent</th><th>Your median reply</th><th>Who starts</th></tr></thead><tbody>{s.dms.top.map((t) => <tr key={t.thread}><td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.thread}</td><td className="mono">{t.n}</td><td className="mono">{t.sentShare ? Math.round(t.sentShare * 100) + '%' : '—'}</td><td className="mono">{t.medianReplyMin == null ? '—' : t.medianReplyMin < 60 ? Math.round(t.medianReplyMin) + ' min' : (t.medianReplyMin / 60).toFixed(1) + ' h'}</td><td>{t.firstMover}</td></tr>)}</tbody></table></div></div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>When you message</h3><Bars v={s.dms.byHour} label="Messages by hour" /><div className="legend" style={{ justifyContent: 'space-between' }}><span className="mono">00</span><span className="mono">12</span><span className="mono">23</span></div><div className="grid g3" style={{ gap: 8 }}><div className="kpi t-purple" style={{ minHeight: 0, padding: 14 }}><span className="v" style={{ fontSize: 26 }}>{Math.round(s.dms.nightShare * 100)}%</span><span className="k">between midnight and 4 am</span></div><div className="kpi t-lime" style={{ minHeight: 0, padding: 14 }}><span className="v" style={{ fontSize: 26 }}>{s.dms.avgLen}</span><span className="k">avg characters</span></div><div className="kpi t-orange" style={{ minHeight: 0, padding: 14 }}><span className="v" style={{ fontSize: 26 }}>{Math.round(s.dms.mediaShare * 100)}%</span><span className="k">with media or shares</span></div></div><span className="sub">Reply times need the JSON export with your name in personal_information to tell your messages from theirs.</span></div>
      </div></section>}

    {(s.links || s.story.total > 0 || s.shopping) && <section className="sec"><div className="sec-h"><h2>What you tap</h2><span className="sub">things most people don't know Instagram logs</span></div>
      <div className="grid g3">
        {s.links && <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>In-app browser history <span className="sub">· {s.links.total.toLocaleString()}</span></h3><List rows={s.links.topDomains} /><span className="sub">{s.links.shopping} of these look like shopping. Receipt: link_history</span></div>}
        {s.story.total > 0 && <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>Story interactions <span className="sub">· {s.story.total.toLocaleString()}</span></h3><List rows={s.story.byKind} /><span className="sub">Most with: {s.story.topAccounts.slice(0, 3).map((a) => a.actor).join(', ') || '—'}</span></div>}
        {s.shopping && <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>Products viewed <span className="sub">· {s.shopping.items}</span></h3><List rows={s.shopping.merchants} /></div>}
      </div></section>}

    <section className="sec"><div className="sec-h"><h2>Searches &amp; ads</h2></div>
      <div className="grid g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><h3>Searches <span className="sub">· {s.searches.total}</span></h3><span className="what">{s.searches.accounts} account look-ups · {s.searches.phrases} phrases</span><div className="pills">{s.searches.recent.map((q, k) => <span key={k} className="tagchip">{q}</span>)}</div></div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><h3>Ads <span className="sub">· {s.ads.seen.toLocaleString()} seen · {s.ads.clicked} clicked ({(s.ads.ctr * 100).toFixed(1)}%)</span></h3><List rows={s.ads.topAdvertisers} /></div>
      </div></section>
  </main>;
}
