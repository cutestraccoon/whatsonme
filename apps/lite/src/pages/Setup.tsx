import { useRef, useState } from 'react';
import type { ParseResult, Report } from '@bigbrother/core';
import { SOURCES, EXPORT_CHECKLIST, type SourceDef } from '../sources';
import type { Desktop } from '../App';
import { Hero } from '../components/Hero';
import type { usePwa } from '../pwa';

interface P { results: ParseResult[]; report: Report | null; busy: boolean; log: string[]; onFiles: (f: File[]) => void; onDrop: (dt: DataTransfer) => void; banner: { kind: 'info' | 'error'; text: string } | null; onResults: (r: ParseResult[]) => void; desktop: Desktop | null; onReset: () => void; onSample: () => void; canForget: boolean; pwa: ReturnType<typeof usePwa>; onOpen: () => void; keep: boolean; onKeep: (on: boolean) => void }

export function Setup({ results, report, busy, log, onFiles, onDrop, banner, onResults, desktop, onReset, onSample, canForget, pwa, onOpen, keep, onKeep }: P) {
  const [over, setOver] = useState(false); const [tier, setTier] = useState<'fun' | 'deep'>('fun'); const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const have = new Set(results.filter((r) => r.events.length || r.claims.length).map((r) => r.source));
  const status = (s: SourceDef) => s.match.some((m) => have.has(m)) ? 'done' : 'idle';
  const list = SOURCES.filter((s) => s.tier === tier && (s.lane !== 'desktop' || desktop?.desktop || tier === 'deep'));
  const doneCount = SOURCES.filter((s) => status(s) === 'done').length;

  const [err, setErr] = useState<string | null>(null);
  const call = async (path: string, body: object) => { if (!desktop) return; setErr(null); try { const r = await fetch(desktop.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok || j?.error) throw new Error(j?.error || `Server said ${r.status}`); onResults(Array.isArray(j) ? j : [j]); } catch (e) { setErr((e as Error).message); } };
  const collect = (id: string) => call('/api/collect', { id });
  const importPath = (path: string) => call('/api/import', { path });

  return <main className="readable">
    <Hero tone="ink" accent="purple" kicker={report ? 'Add more sources' : 'Your data, as the algorithm saw it'}
      title={report ? <>Add more sources.<br />Your file gets sharper.</> : <>Drop your exports here.<br /><span style={{ color: '#FF7A1A' }}>We never see them.</span></>}
      lead={<>Every file is parsed inside this tab{desktop?.desktop ? ' or by the local server on this computer' : ''}. Close the tab and it's gone. Start with one fast source (Instagram usually arrives within the hour) and add the slow ones as they land.</>}>
      <div className="pills" role="tablist" style={{ marginTop: 6 }}>
        <button className={'pill' + (tier === 'fun' ? ' on' : '')} style={{ borderColor: '#F4F1EA', color: tier === 'fun' ? '#06080C' : '#F4F1EA', background: tier === 'fun' ? '#F4F1EA' : 'transparent' }} onClick={() => setTier('fun')} role="tab" aria-selected={tier === 'fun'}>Social + Google + Apple</button>
        <button className={'pill' + (tier === 'deep' ? ' on' : '')} style={{ borderColor: '#F4F1EA', color: tier === 'deep' ? '#06080C' : '#F4F1EA', background: tier === 'deep' ? '#F4F1EA' : 'transparent' }} onClick={() => setTier('deep')} role="tab" aria-selected={tier === 'deep'}>Deep audit: health, dating, gaming, browser…</button>
      </div>
    </Hero>

    <section className={'drop' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer); }}>
      <h2>Drop your files</h2>
      <p className="lead" style={{ textAlign: 'center' }}>Drag any export zip here: Instagram, TikTok, Takeout, Apple, Spotify, X, Snapchat, Uber, Health, WhatsApp .txt. Several at once is fine.{!report && <> No exports yet? <b>Try it with sample data</b>: 14 made-up sources, nobody real.</>}</p>
      <div className="pills"><button className="btn" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Working…' : 'Choose files'}</button>{report ? <button className="btn acc" onClick={onOpen}>▶ Play my Wrapped</button> : <button className="btn ghost" onClick={onSample} disabled={busy}>Try it with sample data</button>}{canForget && <button className="btn ghost" onClick={onReset}>Forget everything</button>}</div>
      <input ref={input} type="file" multiple accept=".zip,.json,.txt,.csv,.xml,.js" style={{ display: 'none' }} onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} aria-label="Choose export files" />
      {banner && <div role="status" aria-live="polite" style={{ width: '100%', maxWidth: 720, textAlign: 'left', borderRadius: 14, padding: '12px 16px', fontSize: 14, fontWeight: 600, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: banner.kind === 'error' ? '#FFE1E8' : '#DDF3FB', color: '#06080C' }}>{busy && banner.kind === 'info' ? '⏳ ' : banner.kind === 'error' ? '✕ ' : '✓ '}{banner.text}</div>}
      {log.length > 0 && <details style={{ width: '100%', maxWidth: 720 }}><summary className="sub" style={{ cursor: 'pointer' }}>log</summary><div className="log">{log.slice(-12).join('\n')}</div></details>}
    </section>

    {!report && <section className="grid g3">
      <div className="kpi t-ink" style={{ minHeight: 0 }}><span className="v" style={{ fontSize: 22 }}>Airplane-mode test</span><span className="k">Turn on airplane mode. Everything still works, because nothing is sent anywhere.</span></div>
      <div className="kpi t-lime" style={{ minHeight: 0 }}><span className="v" style={{ fontSize: 22 }}>Zero requests</span><span className="k">Open your browser's Network tab while you use it: no uploads, no analytics, no trackers.</span></div>
      {pwa.standalone ? <div className="kpi t-cyan" style={{ minHeight: 0 }}><span className="v" style={{ fontSize: 22 }}>Installed</span><span className="k">Running as an app on this device. Your exports open from Files or Downloads.</span></div>
        : pwa.install ? <button className="kpi t-cyan" style={{ minHeight: 0, border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={pwa.install}><span className="v" style={{ fontSize: 22 }}>Install the app →</span><span className="k">Adds it to your home screen. Works offline, no store needed.</span></button>
        : pwa.ios ? <div className="kpi t-cyan" style={{ minHeight: 0 }}><span className="v" style={{ fontSize: 22 }}>Add to Home Screen</span><span className="k">In Safari: tap Share, then “Add to Home Screen”. It then runs like an app, offline.</span></div>
        : <div className="kpi t-cyan" style={{ minHeight: 0 }}><span className="v" style={{ fontSize: 22 }}>Open source</span><span className="k">Read the code or run it yourself. Every number shows the file it came from.</span></div>}
    </section>}

    {report && <section className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><b>{doneCount} of {SOURCES.length} sources connected</b><span className="mono" style={{ color: '#FF7A1A' }}>{Math.round((doneCount / SOURCES.length) * 100)}%</span></div>
        <div className="bar"><div style={{ width: `${(doneCount / SOURCES.length) * 100}%` }} /></div>
        <span className="sub">{report.totals.events.toLocaleString()} events · {report.totals.claims} platform claims · exposure {report.score.value}/100</span>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#5E5B53' }}><input type="checkbox" checked={keep} onChange={(e) => onKeep(e.target.checked)} /> Keep my parsed file on this device (browser storage, this browser only). Off by default.</label>
      </div>
      {report.warnings.length > 0 && <div className="warn" style={{ flex: '1 1 300px' }}>{report.warnings.slice(0, 3).map((w, i) => <div key={i}>{w}</div>)}</div>}
    </section>}

    {desktop?.desktop && <section className="sec">
      <div className="sec-h"><h2>Found on this computer</h2><span className="sub">detected by the local server · nothing read until you click</span></div>
      {err && <div className="warn">{err}</div>}
      {desktop.sources.length === 0 && <p className="lead">Nothing detected in Downloads or browser profiles yet. Drop files above or download an export first.</p>}
      <div className="grid g2">{desktop.sources.map((s) => <div key={s.id} className="card srcrow"><div className="ico" style={{ background: s.kind === 'collector' ? '#4CC9F0' : '#F5C451' }}>{s.kind === 'collector' ? '⌕' : '⇩'}</div><div style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{s.label}</div><div className="how" style={{ wordBreak: 'break-all' }}>{s.path} · {(s.bytes / 1e6).toFixed(1)} MB</div></div><button className="btn" disabled={busy} onClick={() => (s.kind === 'collector' ? collect(s.id) : importPath(s.path))}>{s.kind === 'collector' ? 'Read' : 'Import'}</button></div>)}</div>
    </section>}

    <section className="sec">
      <div className="sec-h"><h2>{tier === 'fun' ? 'Get the files' : 'Deep-audit sources'}</h2><span className="sub">tap a row for exact steps · on a phone the zip lands in Files / Downloads, then use Choose files</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((s) => { const st = status(s); const isOpen = open === s.id; return <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <button className="row-btn" style={{ borderRadius: 0 }} onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
            <div className="srcrow" style={{ padding: '16px 18px' }}>
              <div className="ico" style={{ background: s.color }}>{s.initial}</div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 16 }}>{s.label}</b><span className={'badge ' + st}>{st === 'done' ? 'Connected' : 'Not connected'}</span><span className="how">{s.lane === 'phone' ? 'from your phone' : s.lane === 'desktop' ? 'desktop app' : s.eta}</span></div>
                <span className="what">{s.what}</span>
              </div>
              <span style={{ color: '#8A867B', fontSize: 22, fontWeight: 800 }}>{isOpen ? '−' : '+'}</span>
            </div>
          </button>
          {isOpen && <div className="detail" style={{ gridTemplateColumns: '1fr' }}>
            <span><b style={{ color: '#06080C' }}>Steps: </b>{s.how}</span>
            <div className="pills">{s.url && <a className="btn" href={s.url} target="_blank" rel="noopener noreferrer">Open {s.label.split(' ')[0]} export page ↗</a>}<button className="btn ghost" onClick={() => input.current?.click()}>I have the file</button></div>
          </div>}
        </div>; })}
      </div>
    </section>

    <section className="grid g2">
      <div className="card"><h3>Before you request</h3><ul style={{ margin: '10px 0 0', paddingLeft: 18, color: '#5E5B53', fontSize: 14.5, lineHeight: 1.6 }}>{EXPORT_CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ul></div>
      <div className="card" style={{ background: '#C6F432' }}><h3>Promises</h3><ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 14.5, lineHeight: 1.6 }}><li><b>Local only.</b> Parsing runs in this tab{desktop?.desktop ? ' or on your own computer' : ''}. There is no upload endpoint.</li><li><b>No passwords.</b> You request every export yourself; we only read the finished file.</li><li><b>Messages are counted, never read.</b> We keep timestamps and lengths, not text.</li><li><b>Forget everything</b> wipes memory. Nothing is written to disk unless you ask.</li></ul></div>
    </section>
  </main>;
}
