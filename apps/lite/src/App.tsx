import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ParseResult, Report } from '@bigbrother/core';
import { sampleZips } from '@bigbrother/core';
import type { OutMsg } from './worker';
import { Setup } from './pages/Setup';
import { Dossier } from './pages/Dossier';
import { Attention } from './pages/Attention';
import { Letters } from './pages/Letters';
import { Social } from './pages/Social';
import { Flows } from './pages/Flows';
import { Wrapped } from './pages/Wrapped';
import { Eye } from './components/Eye';
import { clearAll, keepEnabled, loadResults, saveResults } from './store';
import { runParse, filesFromDrop } from './parse';
import { usePwa } from './pwa';

export type Page = 'setup' | 'dossier' | 'attention' | 'letters' | 'social' | 'flows' | 'wrapped';
export interface Desktop { desktop: boolean; base: string; sources: { id: string; label: string; path: string; bytes: number; kind: string }[] }

export function App() {
  const [page, setPage] = useState<Page>('setup');
  const [results, setResults] = useState<ParseResult[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const workerReady = useRef(false);
  const [keep, setKeep] = useState(false);
  const [desktop, setDesktop] = useState<Desktop | null>(null);
  const worker = useRef<Worker | null>(null);
  const resultsRef = useRef<ParseResult[]>([]); resultsRef.current = results;
  const keepRef = useRef(false); keepRef.current = keep;
  const busyRef = useRef(false); busyRef.current = busy;
  const gen = useRef(0); const genAtPost = useRef(0); // "Forget everything" bumps gen so a stale worker result is ignored
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const pwa = usePwa();

  // one worker, one message handler; state updates go through refs so merges never use a stale snapshot
  useEffect(() => {
    let w: Worker | null = null;
    try { w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); } catch (e) { setLog((l) => [...l, 'Web Worker unavailable, parsing in-page instead: ' + (e as Error).message]); }
    worker.current = w;
    (async () => { const on = await keepEnabled(); setKeep(on); if (on) { const rs = await loadResults(); if (rs?.length) { setLog(['Restoring your file from this device…']); void run([], rs); } } })();
    if (!w) return;
    w.onmessage = (ev: MessageEvent<OutMsg>) => { const m = ev.data; if (m.type !== 'ready' && m.type !== 'progress' && gen.current !== genAtPost.current) return;
      if (m.type === 'ready') { workerReady.current = true; return; }
      if (m.type === 'progress') setLog((l) => [...l.slice(-60), m.msg]);
      if (m.type === 'error') { setLog((l) => [...l, 'Error: ' + m.msg]); setStatus({ kind: 'error', text: m.msg }); setBusy(false); }
      if (m.type === 'done') { setResults(m.results); setReport(m.report); setBusy(false); setStatus({ kind: 'info', text: `Done: ${m.report.totals.events.toLocaleString()} events from ${m.results.map((r) => r.source).join(', ')}.` }); setLog((l) => [...l, `Done. ${m.report.totals.events.toLocaleString()} events, ${m.report.totals.claims} platform claims.`]); if (keepRef.current) void saveResults(m.results); setPage((p) => (p === 'setup' ? 'wrapped' : p)); } };
    w.onerror = (e) => { setLog((l) => [...l, 'Worker unavailable, parsing in-page instead: ' + (e.message || 'blocked')]); workerReady.current = false; };
    return () => w.terminate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);

  useEffect(() => { if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return; (async () => { for (const base of ['', 'http://127.0.0.1:4747']) { try { const r = await fetch(base + '/api/ping', { signal: AbortSignal.timeout(800) }); if (r.ok) { const j = await r.json(); if (j.desktop) { const s = await (await fetch(base + '/api/sources')).json(); setDesktop({ desktop: true, base, sources: s }); return; } } } catch { /* not desktop */ } } })(); }, []);

  const run = useCallback(async (files: File[], prior: ParseResult[]) => {
    if (busyRef.current) { setStatus({ kind: 'info', text: 'Still working on the previous files. Try again in a moment.' }); return; }
    busyRef.current = true; setBusy(true); const myGen = gen.current; setStatus({ kind: 'info', text: `Reading ${files.length} file(s) locally…` }); setLog((l) => [...l, `Reading ${files.length} file(s) locally…`]);
    // Prefer the worker; if it never said "ready" (sandboxed host, blocked CSP), parse on the main thread.
    const useWorker = worker.current && (workerReady.current || await waitReady(workerReady, 1500));
    if (useWorker) { try { genAtPost.current = myGen; worker.current!.postMessage({ type: 'parse', files, tz, prior }); return; } catch (e) { setLog((l) => [...l, 'Worker refused the files, parsing in-page: ' + (e as Error).message]); } }
    try { const { results, report } = await runParse(files, tz, prior, (msg) => { setLog((l) => [...l.slice(-60), msg]); setStatus({ kind: 'info', text: msg }); });
      if (gen.current !== myGen) return;
      setResults(results); setReport(report); setStatus({ kind: 'info', text: `Done: ${report.totals.events.toLocaleString()} events from ${results.map((r) => r.source).join(', ')}.` }); if (keepRef.current) void saveResults(results); setPage((p) => (p === 'setup' ? 'wrapped' : p)); }
    catch (e) { const msg = (e as Error).message; setLog((l) => [...l, 'Error: ' + msg]); setStatus({ kind: 'error', text: msg }); }
    finally { setBusy(false); }
  }, [tz]);
  const ingest = useCallback((files: File[]) => { if (files.length) void run(files, resultsRef.current); }, [run]);
  const ingestDrop = useCallback(async (dt: DataTransfer) => { const files = await filesFromDrop(dt); if (!files.length) { setStatus({ kind: 'error', text: 'Nothing readable in that drop.' }); return; } void run(files, resultsRef.current); }, [run]);
  const ingestResults = useCallback((rs: ParseResult[]) => { void run([], [...resultsRef.current, ...rs]); }, [run]);
  const loadSample = useCallback(async () => { if (busyRef.current) return; setStatus({ kind: 'info', text: 'Generating sample exports for 14 sources…' }); try { const zips = await sampleZips(); const files = zips.map((z) => new File([z.bytes as BlobPart], z.name, { type: 'application/zip' })); await run(files, []); } catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); } }, [run]);
  const reset = async () => { gen.current++; setResults([]); setReport(null); setLog([]); setStatus(null); setBusy(false); setPage('setup'); setKeep(false); await clearAll(); };
  const toggleKeep = async (on: boolean) => { setKeep(on); if (on) await saveResults(resultsRef.current); else await clearAll(); };
  const nav = (p: Page, label: string, needs = true, cls = '') => <button className={(page === p ? 'on ' : '') + cls} disabled={needs && !report} onClick={() => setPage(p)}>{label}</button>;

  return <>
    <header className="hdr">
      <div className="brand"><Eye color="#06080C" /> Big Brother {desktop?.desktop && <span className="tag" style={{ background: '#4CC9F0' }}>DESKTOP</span>}</div>
      <nav className="nav" aria-label="Sections">{nav('wrapped', '▶ Wrapped', true, 'play')}{nav('dossier', 'Your file')}{nav('flows', 'Who has it')}{nav('attention', 'Habits')}{nav('social', 'Deep dive')}{nav('letters', 'Letters')}{nav('setup', report ? `Sources · ${results.length}` : 'Add your data', false)}</nav>
      <span className="live"><span className="dot" />{desktop?.desktop ? 'local server · nothing uploaded' : pwa.offlineReady || pwa.standalone ? 'works offline · nothing uploaded' : 'nothing leaves this device'}</span>
    </header>
    {pwa.update && <div className="upd" role="status">A new version is ready. <button onClick={pwa.update}>Reload</button></div>}
    {page === 'setup' && <Setup results={results} report={report} busy={busy} log={log} onFiles={ingest} onDrop={ingestDrop} onResults={ingestResults} banner={status} desktop={desktop} onReset={reset} onSample={loadSample} canForget={keep || results.length > 0} pwa={pwa} onOpen={() => setPage('wrapped')} keep={keep} onKeep={toggleKeep} />}
    {page === 'dossier' && report && <Dossier report={report} go={setPage} />}
    {page === 'attention' && report && <Attention report={report} />}
    {page === 'flows' && report && <Flows report={report} go={setPage} />}
    {page === 'wrapped' && report && <Wrapped report={report} go={setPage} />}
    {page === 'letters' && report && <Letters report={report} />}
    {page === 'social' && report && <Social report={report} />}
  </>;
}

function waitReady(ref: { current: boolean }, ms: number) { return new Promise<boolean>((res) => { const t0 = Date.now(); const tick = () => { if (ref.current) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(tick, 50); }; tick(); }); }
