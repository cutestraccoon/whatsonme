import { useState } from 'react';
import type { Report } from '@bigbrother/core';
import { SETTINGS_LINKS } from '@bigbrother/core';
import type { Page } from '../App';
import { cap, DAYS, pad } from '../components/Eye';
import { Hero, C } from '../components/Hero';
import { Portrait } from '../components/Portrait';
import { Finds } from '../components/Finds';

const ROUTINE_C: Record<string, string> = { Home: C.purple, Work: C.cyan, Transit: C.lime, Away: C.pink, Out: C.orange, 'No signal': '#E4DFD3' };
const SEV: Record<string, string> = { 'HIGH VALUE': C.orange, MED: C.lime, LOW: C.cyan };

/** "Your file": the verdict, what your history says, the labels on you, your feed decoded, then how to go dark. */
export function Dossier({ report: r, go }: { report: Report; go: (p: Page) => void }) {
  const [open, setOpen] = useState<number>(-1); const [feed, setFeed] = useState(0); const [openLinks, setOpenLinks] = useState<string | null>(null);
  const fd = r.feeds[feed];
  const after = Math.max(0, r.score.value + r.actions.reduce((n, a) => n + a.delta, 0));
  return <main className="readable">
    <Hero tone="orange" accent="purple" kicker={`Your file · ${r.sources.length} ${r.sources.length === 1 ? 'source' : 'sources'} · ${new Date(r.generatedAt).toLocaleDateString()}`}
      title={<>The algorithm decided you are <span style={{ color: C.cream }}>{r.verdict}</span></>}
      lead={r.summary}>
      <div className="hero-row"><button className="btn" onClick={() => go('wrapped')}>▶ Play your Wrapped</button><button className="btn" style={{ background: 'transparent', color: C.ink }} onClick={() => go('flows')}>Who has your data →</button></div>
    </Hero>

    <section className="grid g4">
      <div className="kpi t-ink"><span className="v">{r.totals.records.toLocaleString()}</span><span className="k">records on file</span></div>
      <div className="kpi t-pink"><span className="v">{r.score.value}<span style={{ fontSize: 18, opacity: .6 }}>/100</span></span><span className="k">exposure score</span></div>
      <div className="kpi t-lime"><span className="v">{r.dossier.length}</span><span className="k">things they inferred, none typed by you</span></div>
      <div className="kpi t-cyan"><span className="v">{r.snitches.length.toLocaleString()}</span><span className="k">companies holding your data</span></div>
    </section>

    <Portrait report={r} />

    {r.dossier.length > 0 && <section className="sec" id="dossier">
      <div className="sec-h"><h2>The labels on your file</h2><span className="sub">tap a row for why, what it's used for, and the receipt</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{r.dossier.map((d, i) => <button key={d.field} className="row-btn" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
        <div className="row"><span className="field">{d.field}</span><span className="val">{d.value}</span><span className="src">{d.src}</span><span className={'conf ' + d.conf}>{d.conf}</span></div>
        {open === i && <div className="detail"><div><div className="k-label acc">Why they think so</div><span>{d.why}</span></div><div><div className="k-label acc">What it's used for</div><span>{d.used}</span></div><div><div className="k-label acc">Receipt</div><span className="receipt">{d.file || '—'}</span></div></div>}
      </button>)}</div>
    </section>}

    {r.flags.length > 0 && <section className="sec">
      <div className="sec-h"><h2>How advertisers can target you</h2><span className="sub">behavioural segments on your file, and who pays for them</span></div>
      <div className="grid g3">{r.flags.map((g) => <div key={g.flag} className="card flag"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><span className="field">{g.src}</span><span className="badge" style={{ background: SEV[g.sev] ?? C.cyan }}>{g.sev}</span></div><div className="t">{g.flag}</div><p><b>Means </b>{g.means}</p><p><b>Trigger </b>{g.trigger}</p><p><b>Who buys it </b>{g.buyers}</p><span className="receipt">{g.file}</span></div>)}</div>
    </section>}

    {fd && <section className="sec">
      <div className="sec-h"><h2>Your feed, decoded</h2><span className="sub">what each feed believes you want</span></div>
      {r.feeds.length > 1 && <div className="pills">{r.feeds.map((f, i) => <button key={f.source} className={'pill' + (i === feed ? ' on' : '')} onClick={() => setFeed(i)}>{cap(f.source)}</button>)}</div>}
      <div className="grid g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3>{fd.title}</h3><span className="sub">{fd.count}</span></div>
          {fd.topics.map((t) => <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}><span>{t.name}</span><span style={{ color: C.orange }}>{t.pct ? t.pct + '%' : 'label'}</span></div><div className="bar"><div style={{ width: `${t.pct}%`, background: t.pct < 15 ? C.purple : C.orange }} /></div><span className="what" style={{ fontSize: 13 }}>{t.because}</span></div>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="inv" style={{ background: C.purple, color: C.ink }}><span className="k-label" style={{ color: 'rgba(6,8,12,.6)' }}>The feed's read on you</span><div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, margin: '8px 0', letterSpacing: '-.02em' }}>{fd.read}</div><span style={{ fontSize: 14, lineHeight: 1.5, opacity: .8 }}>{fd.readWhy}</span></div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><span className="k-label">When it has you</span><div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }} role="img" aria-label="Activity by hour">{fd.hours.map((h, i) => <div key={i} style={{ flex: 1, height: `${Math.max(2, h)}%`, borderRadius: '3px 3px 0 0', background: h >= 70 ? C.orange : '#E4DFD3' }} />)}</div><div className="legend" style={{ justifyContent: 'space-between' }}><span>12 am</span><span>6 am</span><span>noon</span><span>6 pm</span><span>11 pm</span></div></div>
          <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('attention')}>See your habits →</button>
        </div>
      </div>
    </section>}

    {r.routine.home && <section className="sec">
      <div className="sec-h"><h2>Your routine, reconstructed</h2><span className="sub">{r.routine.pings.toLocaleString()} location records · {r.routine.placesLabelled.toLocaleString()} labelled by the platform</span></div>
      <div className="grid g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="hm"><span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="hl">{h % 3 === 0 ? pad(h) : ''}</span>)}{r.routine.weekGrid.map((row, d) => [<span key={'d' + d} className="dl">{DAYS[d]}</span>, ...row.map((c, h) => <div key={d + '-' + h} className="c" title={`${DAYS[d]} ${pad(h)}:00 · ${c}`} style={{ background: ROUTINE_C[c] }} />)])}</div>
          <div className="legend">{Object.entries(ROUTINE_C).map(([k, c]) => <span key={k}><span className="sw" style={{ background: c }} />{k}</span>)}</div>
        </div>
        <div className="grid g2" style={{ alignContent: 'start' }}>{r.routine.facts.map((f) => <div key={f.k} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="k-label">{f.k}</span><b style={{ fontSize: 17 }}>{f.v}</b><span className="what" style={{ fontSize: 13 }}>{f.note}</span></div>)}</div>
      </div>
    </section>}

    <Finds report={r} />

    {r.dump.length > 0 && <details className="card more">
      <summary>Everything on record, by category <span className="sub">· {r.dump.length} categories, with the file each lives in</span></summary>
      <div className="grid g3" style={{ marginTop: 16 }}>{r.dump.map((d) => <div key={d.title} style={{ background: '#F4F1EA', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ fontSize: 16 }}>{d.title}</b><span style={{ fontSize: 22, fontWeight: 800, color: C.orange }}>{d.n}</span></div>{d.rows.map((row) => <div key={row.k} style={{ borderTop: '1px solid #E4DFD3', paddingTop: 8 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{row.k}</div><div className="what" style={{ fontSize: 13 }}>{row.v}</div></div>)}<span className="receipt">{d.file}</span></div>)}</div>
    </details>}

    <section className="dark">
      <div className="sec-h"><h2>Go dark.</h2><span style={{ fontWeight: 800, fontSize: 14, color: C.lime }}>Exposure {r.score.value} → {after} if you do all {r.actions.length}</span></div>
      <div className="grid g3">{r.actions.map((a) => <div key={a.title} className="act"><b style={{ fontSize: 16 }}>{a.title}</b><p>{a.desc}</p>
        {a.links === 'letters' ? <button type="button" onClick={() => go('letters')}>{a.cta} · {a.delta}</button>
          : openLinks === a.title ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{(SETTINGS_LINKS[a.links ?? ''] ?? []).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{l.label} ↗</a>)}{a.links === 'ios' && (SETTINGS_LINKS.android ?? []).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{l.label} ↗</a>)}</div>
          : <button type="button" onClick={() => setOpenLinks(a.title)}>{a.cta} · {a.delta}</button>}
      </div>)}</div>
      <div className="grid g4" style={{ gap: 8 }}>{r.score.parts.map((p) => <div key={p.k} style={{ background: 'rgba(244,241,234,.08)', borderRadius: 12, padding: '10px 12px', fontSize: 12 }}><b>{p.k}: {p.v}</b><div style={{ opacity: .7 }}>{p.note}</div></div>)}</div>
    </section>
  </main>;
}
