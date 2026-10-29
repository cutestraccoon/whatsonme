import { useMemo, useState } from 'react';
import type { Report } from '@bigbrother/core';
import { buildLetter, type Law } from '@bigbrother/core';
import { cap } from '../components/Eye';
import { Hero } from '../components/Hero';

/** Access / deletion letters for every company on the file. Drafted locally; the user sends from their own mailbox. */
export function Letters({ report: r }: { report: Report }) {
  const companies = useMemo(() => { const set = new Map<string, string>(); for (const s of r.sources) set.set(cap(s.source), 'platform'); for (const s of r.snitches) set.set(s.name, s.kind === 'pixel' ? 'tracked you via pixel' : 'uploaded your contact info'); return [...set.entries()]; }, [r]);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(companies.filter(([, k]) => k === 'platform').concat(companies.filter(([, k]) => k === 'uploaded your contact info').slice(0, 8)).map(([n]) => [n, true])));
  const [q, setQ] = useState('');
  const visible = useMemo(() => { const t = q.trim().toLowerCase(); const base = t.length >= 2 ? companies.filter(([n]) => n.toLowerCase().includes(t)) : companies.filter(([n, k]) => picked[n] || k === 'platform'); return base.slice(0, 60); }, [companies, picked, q]);
  const [kind, setKind] = useState<'access' | 'deletion' | 'both'>('both'); const [law, setLaw] = useState<Law>('PIPEDA');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [custom, setCustom] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const chosen = companies.filter(([n]) => picked[n]).map(([n]) => n).concat(custom.split(',').map((s) => s.trim()).filter(Boolean));
  const letters = chosen.map((c) => ({ company: c, ...buildLetter({ company: c, kind, law, yourName: name || undefined, yourEmail: email || undefined }) }));
  const download = () => { const txt = letters.map((l) => `==== ${l.company} ====\nSubject: ${l.subject}\n\n${l.body}\n\n`).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = `big-brother-letters-${law.toLowerCase()}.txt`; a.click(); };
  const mailto = (l: { company: string; subject: string; body: string }) => `mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;
  const copy = async (l: { subject: string; body: string }) => { try { await navigator.clipboard.writeText(`Subject: ${l.subject}\n\n${l.body}`); } catch { /* clipboard blocked */ } };
  return <main className="readable">
    <Hero tone="lime" accent="pink" kicker={`Letters · ${law} · they must answer within ${law === 'CCPA' ? '45' : '30'} days`} title={<>Make them show you<br />the whole file.</>} lead="Exports are what platforms choose to give you. An access request under privacy law makes them list sources, recipients, inferred segments and retention. Drafted here, sent by you from your own mailbox. Nothing is sent automatically." />
    <section className="grid g2">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Who</h3>
        <p className="what">{Object.values(picked).filter(Boolean).length} picked of {companies.length} companies on your file. Search to add more.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the companies that have your data…" className="inp" aria-label="Search companies" />
        <div className="pills">{visible.map(([n, k]) => <button key={n} className={'pill' + (picked[n] ? ' on' : '')} onClick={() => setPicked({ ...picked, [n]: !picked[n] })} title={k}>{n}</button>)}</div>
        <label style={{ fontSize: 13, color: '#5E5B53', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Add companies (comma separated: your carrier, bank, loyalty program, data brokers)<input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Rogers, Acxiom Canada, Equifax" style={inp} /></label>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>What</h3>
        <div className="pills">{(['both', 'access', 'deletion'] as const).map((k) => <button key={k} className={'pill' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{k === 'both' ? 'Access + deletion' : cap(k)}</button>)}</div>
        <div className="pills">{(['PIPEDA', 'GDPR', 'CCPA'] as Law[]).map((l) => <button key={l} className={'pill' + (law === l ? ' on' : '')} onClick={() => setLaw(l)}>{l}</button>)}</div>
        <label style={{ fontSize: 13, color: '#5E5B53', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Your name (stays in this tab)<input value={name} onChange={(e) => setName(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 13, color: '#5E5B53', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>Email on the account<input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} type="email" /></label>
      </div>
    </section>
    <section className="sec">
      <div className="sec-h"><h2>{letters.length} letters ready</h2><div className="pills"><button className="btn acc" onClick={download} disabled={!letters.length}>Download all (.txt)</button></div></div>
      <div className="grid g2">{letters.map((l) => <div key={l.company} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><b style={{ fontSize: 18 }}>{l.company}</b><span className="sub">{l.subject}</span><div className="pills"><a className="btn ghost" href={mailto(l)}>Open in mail</a><button className="btn ghost" onClick={() => copy(l)}>Copy</button><button className="btn ghost" onClick={() => setPreview(preview === l.company ? null : l.company)}>{preview === l.company ? 'Hide' : 'Preview'}</button></div>{preview === l.company && <pre className="log" style={{ maxHeight: 420, fontSize: 12 }}>{l.body}</pre>}</div>)}</div>
      <p className="sub">Tip: send from the email address on the account, keep the reply, and note the date. If day 30 passes with no complete answer, the complaint form at the Privacy Commissioner is the next step.</p>
    </section>
  </main>;
}
const inp: React.CSSProperties = { font: 'inherit', fontSize: 15, background: '#F4F1EA', color: '#06080C', border: '2px solid #E4DFD3', borderRadius: 12, padding: '10px 12px', minHeight: 44 };
