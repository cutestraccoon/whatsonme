import { useState } from 'react';
import type { Report } from '@bigbrother/core';
import { MOOD_ORDER, MOOD_EXAMPLES } from '@bigbrother/core';
import { cap, DAYS, MOODC, PLATFORM, rgba } from '../components/Eye';
import { Hero } from '../components/Hero';

const H = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const HL = (h: number) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);
const fmtH = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);

/** Habits: when you're on, for how long, and how it's changing. One chart per question, labelled in plain words. */
export function Attention({ report: r }: { report: Report }) {
  const h = r.habits; const a = r.attention;
  const [plat, setPlat] = useState('All');
  const plats = h.perSource.map((p) => p.source);
  const peak = h.typicalDay.reduce((b, x) => (x.perDay > b.perDay ? x : b), h.typicalDay[0]);
  const dayMax = Math.max(1, ...h.typicalDay.map((x) => x.perDay));
  // week grid from attention (watch-type), single colour scale
  let gMax = 1; for (const row of a.grid) for (const c of row) { const v = plat === 'All' ? c.total : c.bySource[plat] ?? 0; if (v > gMax) gMax = v; }
  const wkMax = Math.max(1, ...h.weekly.map((w) => Object.values(w.bySource).reduce((n, v) => n + v, 0)));
  const srcMax = Math.max(0.01, ...h.perSource.map((p) => p.hours));
  if (!h.perSource.length) return <main className="readable"><section className="sec"><h1>No watch history yet.</h1><p className="lead">Add TikTok, Instagram, YouTube or Spotify to see your habits.</p></section></main>;
  return <main className="readable">
    <Hero tone="purple" accent="lime" kicker={`Your habits · times in ${a.tz}`} title={<>About <span style={{ color: '#F4F1EA' }}>{fmtH(h.hoursPerDay)}</span> a day. Busiest at {HL(peak.hour)}.</>} />
    <section className="grid g4">
      <div className="kpi t-ink"><span className="v">{fmtH(h.hoursTotal)}</span><span className="k">total, over {h.days} active days</span></div>
      <div className="kpi t-orange"><span className="v">{h.sessions.perDay.toFixed(1)}</span><span className="k">sessions a day · {Math.round(h.sessions.avgMin)} min each</span></div>
      <div className="kpi t-cyan"><span className="v">{Math.round(h.sessions.longestMin)} min</span><span className="k">longest session · {h.sessions.longestWhen}</span></div>
      <div className="kpi t-pink"><span className="v">{h.sessions.lateNightsPerWeek.toFixed(1)}</span><span className="k">nights a week still on after 1 am</span></div>
    </section>

    <section className="sec">
      <h2>Your typical day</h2>
      <p className="lead">How many videos you watch at each hour, on an average day you use these apps.</p>
      <div className="card">
        <div className="day" role="img" aria-label={`Items per hour; peak at ${HL(peak.hour)}`}>
          {h.typicalDay.map((x) => <div key={x.hour} className="day-col" title={`${HL(x.hour)} · ${x.perDay.toFixed(1)} per day`}>
            <span className="day-n">{x.hour === peak.hour ? Math.round(x.perDay) : ''}</span>
            <div className="day-bar" style={{ height: `${Math.max(2, (x.perDay / dayMax) * 100)}%`, background: x.hour === peak.hour ? '#FF7A1A' : x.hour < 5 ? '#B47CFF' : '#4CC9F0' }} />
            <span className="day-h">{x.hour % 3 === 0 ? H(x.hour) : ''}</span>
          </div>)}
        </div>
        <div className="legend" style={{ marginTop: 10 }}><span><span className="sw" style={{ background: '#FF7A1A' }} />peak hour</span><span><span className="sw" style={{ background: '#B47CFF' }} />midnight to 5 am</span><span><span className="sw" style={{ background: '#4CC9F0' }} />rest of the day</span></div>
      </div>
    </section>

    <section className="sec">
      <div className="sec-h"><h2>Your week</h2><div className="pills"><button className={'pill' + (plat === 'All' ? ' on' : '')} onClick={() => setPlat('All')}>All apps</button>{plats.map((p) => <button key={p} className={'pill' + (plat === p ? ' on' : '')} onClick={() => setPlat(p)}>{cap(p)}</button>)}</div></div>
      <p className="lead">Each square is one hour of the week. Darker means you watched more then.</p>
      <div className="card">
        <div className="wk"><span />{Array.from({ length: 24 }, (_, x) => <span key={x} className="wk-h">{x % 3 === 0 ? H(x) : ''}</span>)}
          {a.grid.map((row, d) => [<span key={'d' + d} className="wk-d">{DAYS[d]}</span>, ...row.map((c, x) => { const v = plat === 'All' ? c.total : c.bySource[plat] ?? 0; const t = v / gMax; return <div key={d + '-' + x} className="wk-c" title={`${DAYS[d]} ${HL(x)} · ${v}`} style={{ background: v === 0 ? '#F4F1EA' : rgba('#FF7A1A', 0.12 + Math.sqrt(t) * 0.88) }} />; })])}
        </div>
        <div className="scale"><span>less</span>{[0.1, 0.3, 0.55, 0.8, 1].map((t) => <span key={t} className="sw" style={{ background: rgba('#FF7A1A', 0.12 + Math.sqrt(t) * 0.88), width: 18, height: 12 }} />)}<span>more</span></div>
      </div>
    </section>

    <section className="grid g2">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3>Where the time goes</h3>
        {h.perSource.map((p) => <div key={p.source} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{cap(p.source)}</span><span className="mono" style={{ color: '#FF7A1A' }}>{fmtH(p.hours)}</span></div><div className="bar" style={{ height: 10 }}><div style={{ height: 10, width: `${(p.hours / srcMax) * 100}%`, background: PLATFORM[p.source] ?? '#FF7A1A' }} /></div><span className="sub" style={{ fontFamily: 'inherit' }}>{p.items.toLocaleString()} items</span></div>)}
        <p className="what">Time is estimated from your sessions: back-to-back activity with gaps under 20 minutes counts as one sitting.</p>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3>Watching vs choosing</h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 48, fontWeight: 800, color: '#FF7A1A', letterSpacing: '-.03em' }}>{Math.round(h.chosen.rate * 100)}%</span><span className="what">of what you watched, you liked, saved, shared or commented on.</span></div>
        <p className="what">{h.chosen.liked.toLocaleString()} actions on {h.chosen.consumed.toLocaleString()} items. The rest was picked for you by the feed. Every second you linger still counts as a signal.</p>
      </div>
    </section>

    <section className="sec">
      <h2>Over the last 6 months</h2>
      <p className="lead">Videos watched per week, by app.</p>
      <div className="card">
        <div className="trend" role="img" aria-label="Weekly totals for the last 26 weeks">{h.weekly.map((w) => { const tot = Object.values(w.bySource).reduce((n, v) => n + v, 0); return <div key={w.week} className="trend-col" title={`week of ${w.week} · ${tot}`}><div className="trend-stack" style={{ height: `${(tot / wkMax) * 100}%` }}>{plats.map((p) => (w.bySource[p] ? <div key={p} style={{ flex: `${w.bySource[p]} 0 0`, background: PLATFORM[p] ?? '#FF7A1A' }} /> : null))}</div></div>; })}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }} className="sub"><span>{h.weekly[0]?.week}</span><span>{h.weekly[13]?.week}</span><span>{h.weekly[25]?.week}</span></div>
        <div className="legend" style={{ marginTop: 8 }}>{plats.map((p) => <span key={p}><span className="sw" style={{ background: PLATFORM[p] }} />{cap(p)}</span>)}</div>
      </div>
    </section>

    {h.enoughForMood && r.weeks.some((w) => w.n >= 20) ? <details className="card more">
      <summary><b>Topics & mood over time</b> <span className="sub" style={{ fontFamily: 'inherit' }}>· from captions and hashtags (experimental)</span></summary>
      <p className="what" style={{ margin: '10px 0' }}>We class each captioned item by tone: a tutorial is Learn, a house tour is Aspire, a meme is Funny. Weeks with fewer than 20 captioned items are left blank.</p>
      <div className="stack" style={{ height: 160 }}>{r.weeks.map((w) => <div key={w.label} title={`${w.label} · ${w.n} items`}>{w.n < 20 ? <div style={{ flex: 1, background: '#ECE7DB' }} /> : MOOD_ORDER.map((m) => w.shares[m] > 0 && <div key={m} title={`${m} ${Math.round(w.shares[m] * 100)}%`} style={{ flex: `${w.shares[m]} 0 0`, background: MOODC[m] }} />)}</div>)}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>{r.weeks.map((w) => <span key={w.label} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#8A867B', fontWeight: 600 }}>{w.label}</span>)}</div>
      <div className="legend" style={{ marginTop: 10 }}>{MOOD_ORDER.map((m) => <span key={m}><span className="sw" style={{ background: MOODC[m] }} />{m} <span style={{ color: '#8A867B' }}>· {MOOD_EXAMPLES[m]}</span></span>)}</div>
      {r.eras.filter((e) => e.share >= 0.15).length > 1 && <><h3 style={{ marginTop: 18 }}>Your eras</h3><div className="grid g3">{r.eras.filter((e) => e.share >= 0.15).map((e, i) => <div key={i} style={{ borderLeft: `4px solid ${MOODC[e.mood]}`, paddingLeft: 12 }}><span className="sub">{e.startMonth}{e.endMonth !== e.startMonth ? ` → ${e.endMonth}` : ''}</span><div><b>{e.name}</b></div><span className="what">{e.note}</span></div>)}</div></>}
    </details> : <p className="sub" style={{ fontFamily: 'inherit' }}>Mood and topic trends need captioned content (Instagram watched/liked posts, YouTube titles). TikTok exports only links, so they're left out rather than guessed.</p>}
  </main>;
}
