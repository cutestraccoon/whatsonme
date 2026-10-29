import type { Report } from '@bigbrother/core';

/** "What your history says about you": plain statements, each with the evidence and the file it came from. */
export function Portrait({ report: r }: { report: Report }) {
  if (!r.portrait.length) return null;
  return <section className="sec">
    <div className="sec-h"><h2>What your history says about you</h2><span className="sub">{r.portrait.length} readings · each one shows its evidence</span></div>
    <div className="portrait">{r.portrait.map((s) => <article key={s.id} className={'pcard ' + s.strength}>
      <span className="psrc">{s.source}</span>
      <h3>{s.title}</h3>
      <p>{s.body}</p>
      {s.evidence.length > 0 && <div className="taglist">{s.evidence.slice(0, 10).map((e) => <span key={e} className="tagchip">{e}</span>)}</div>}
    </article>)}</div>
  </section>;
}
