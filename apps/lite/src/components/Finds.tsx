import { useState } from 'react';
import type { Report } from '@bigbrother/core';

const TONES = ['#FF7A1A', '#B47CFF', '#4CC9F0', '#FF5C8A', '#C6F432'];

/** Blurred "tap to reveal" cards: the TikTok moment. */
export function Finds({ report: r }: { report: Report }) {
  const [shown, setShown] = useState<Record<number, boolean>>({});
  if (!r.finds.length) return null;
  const all = () => setShown(Object.fromEntries(r.finds.map((_, i) => [i, true])));
  return <section className="sec">
    <div className="sec-h"><h2>Creepiest finds</h2><button className="pill" onClick={all}>Reveal all</button></div>
    <div className="grid g3">{r.finds.map((f, i) => <button key={i} type="button" onClick={() => setShown({ ...shown, [i]: true })} aria-expanded={!!shown[i]} className="card" style={{ textAlign: 'left', color: '#06080C', background: TONES[i % TONES.length], minHeight: 180, cursor: shown[i] ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'flex-end' }}>
      <span className="field" style={{ color: 'rgba(6,8,12,.6)' }}>{f.src} · #{i + 1}</span>
      <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-.02em', filter: shown[i] ? 'none' : 'blur(9px)', userSelect: shown[i] ? 'auto' : 'none', transition: 'filter .35s' }}>{f.text}</span>
      <span style={{ fontSize: 13, fontWeight: 700, opacity: .7 }}>{shown[i] ? f.hint : 'Tap to reveal'}</span>
      {shown[i] && f.file && <span className="receipt" style={{ color: 'rgba(6,8,12,.6)' }}>{f.file}</span>}
    </button>)}</div>
  </section>;
}
