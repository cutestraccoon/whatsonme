import { useMemo, useState } from 'react';
import type { Report } from '@bigbrother/core';
import type { Page } from '../App';
import { cap, PLATFORM } from '../components/Eye';
import { Hero } from '../components/Hero';

/** "Who has your data": what each platform holds, who it shares with, who reports on you. Plain language, one idea per card. */
export function Flows({ report: r, go }: { report: Report; go: (p: Page) => void }) {
  const f = r.flows; const [q, setQ] = useState(''); const [showAll, setShowAll] = useState(false);
  const hits = useMemo(() => (q.trim().length < 2 ? f.advertisers.sample : f.advertisers.names.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()))), [q, f]);
  const advMax = Math.max(1, ...f.advertisers.industries.filter((i) => !i.name.startsWith('Other')).map((i) => i.n));
  const partnersShown = showAll ? f.partners : f.partners.slice(0, 12);
  const label = (s: string) => (s === 'instagram' ? 'Instagram (Meta)' : cap(s));
  return <main className="readable">
    <Hero tone="pink" accent="lime" kicker="Who has your data" title={f.headline}
      lead={<>Three different things are going on. Platforms <b>keep</b> what you do. Advertisers <b>upload</b> lists with your email or phone to find you. Other apps <b>report</b> what you do inside them. All of it from your own files.</>} />

    <section className="grid g3">
      <div className="kpi t-ink"><span className="v">{f.holdings.reduce((n, h) => n + h.items.length, 0)}</span><span className="k">kinds of data the apps keep on you</span></div>
      <div className="kpi t-orange"><span className="v">{f.advertisers.total.toLocaleString()}</span><span className="k">companies uploaded your contact info</span></div>
      <div className="kpi t-cyan"><span className="v">{f.partnerTotal}</span><span className="k">apps and sites report what you do in them</span></div>
    </section>

    {f.holdings.length > 0 && <section className="sec">
      <h2>What each app keeps on you</h2>
      <div className="grid g2">{f.holdings.map((h) => <div key={h.source} className="card hold">
        <div className="hold-h"><b style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: PLATFORM[h.source] ?? '#FF7A1A', display: 'inline-block' }} />{label(h.source)}</b><span className="sub">{h.items.length} kinds of data</span></div>
        <ul className="checklist">{h.items.map((i) => <li key={i.what}><span className={'tick' + (i.sensitive ? ' hot' : '')} aria-hidden="true" /><div><b>{i.what}</b><span>{i.detail}</span></div></li>)}</ul>
      </div>)}</div>
      <p className="sub">Orange dot = sensitive: messages, location, identity, contacts, or activity outside the app.</p>
    </section>}

    {f.advertisers.total > 0 && <section className="sec">
      <h2>{f.advertisers.total.toLocaleString()} companies uploaded your contact info</h2>
      <p className="lead">Each of these gave Meta a customer list (emails, phone numbers) and Meta told them “this person is on Instagram.” You were matched, and they can now show you ads, or exclude you, or build lookalike audiences from you.</p>
      <div className="grid g2">
        <div className="card"><h3>By industry</h3><p className="what">Where the company name tells us.</p><div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {f.advertisers.industries.filter((i) => !i.name.startsWith('Other')).map((i) => <div key={i.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: 15, fontWeight: 700 }}>{i.name}</span><span className="mono" style={{ color: '#FF7A1A' }}>{i.n}</span></div>
            <div className="bar"><div style={{ width: `${(i.n / advMax) * 100}%` }} /></div>
            <span className="sub" style={{ fontFamily: 'inherit' }}>{i.examples.slice(0, 4).join(' · ')}</span></div>)}
          {f.advertisers.industries.find((i) => i.name.startsWith('Other')) && <span className="sub" style={{ fontFamily: 'inherit' }}>{f.advertisers.industries.find((i) => i.name.startsWith('Other'))!.n.toLocaleString()} more are brand or agency names we can't place by name alone.</span>}
        </div></div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>Find a company</h3>
          <label className="sr-only" htmlFor="advq">Search advertisers</label>
          <input id="advq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name: bank, airline, your carrier…" className="inp" />
          <div className="taglist">{hits.slice(0, 60).map((n) => <span key={n} className="tagchip">{n}</span>)}</div>
          <span className="sub" style={{ fontFamily: 'inherit' }}>{q.trim().length >= 2 ? `${hits.length.toLocaleString()} match “${q.trim()}”${hits.length > 60 ? ' (first 60 shown)' : ''}.` : `A sample of ${f.advertisers.total.toLocaleString()}. Search to check a specific company.`}</span>
          <button className="btn acc" style={{ alignSelf: 'flex-start' }} onClick={() => go('letters')}>Ask them what they have →</button>
        </div>
      </div>
    </section>}

    {f.partners.length > 0 && <section className="sec">
      <h2>{f.partnerTotal} apps and sites report what you do</h2>
      <p className="lead">These businesses installed a TikTok or Meta tracker. Every time you opened their app, logged in, viewed a page or bought something, they sent that event to the platform, tied to your account.</p>
      <div className="card" style={{ padding: 0 }}><div style={{ overflowX: 'auto' }}><table className="tbl tbl-lg">
        <thead><tr><th>Company</th><th>Told</th><th>Events</th><th>What they reported</th><th>Between</th></tr></thead>
        <tbody>{partnersShown.map((p) => <tr key={p.name + p.to}><td><b>{p.named ? p.name : <span style={{ color: '#8A867B' }}>{p.name}</span>}</b></td><td>{p.to}</td><td className="mono" style={{ color: '#FF7A1A' }}>{p.events.toLocaleString()}</td><td style={{ color: '#5E5B53' }}>{p.types.map(prettyEvent).join(', ')}</td><td style={{ fontSize: 12, color: '#8A867B', whiteSpace: 'nowrap' }}>{p.first} → {p.last}</td></tr>)}</tbody>
      </table></div></div>
      {f.partners.length > 12 && <button className="pill" onClick={() => setShowAll(!showAll)} style={{ alignSelf: 'flex-start' }}>{showAll ? 'Show fewer' : `Show all ${f.partners.length}`}</button>}
      {f.partners.some((p) => !p.named) && <p className="sub" style={{ fontFamily: 'inherit' }}>Grey rows: TikTok only gave a numeric partner ID, not the company name.</p>}
    </section>}

    {(f.clicked.length > 0 || f.sites.length > 0) && <section className="grid g2">
      {f.clicked.length > 0 && <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>Ads you clicked ({f.clicked.reduce((n, c) => n + c.n, 0)})</h3><p className="what">Each click carries a tracking ID back to the advertiser, so they know the visit came from you, on that platform.</p>
        {f.clicked.slice(0, 10).map((c) => <div key={c.advertiser + c.platform} className="rowline"><span>{c.advertiser}</span><span className="sub">{c.platform} · {c.n}× · {c.last}</span></div>)}</div>}
      {f.sites.length > 0 && <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><h3>Sites you opened inside the app</h3><p className="what">Links opened in Instagram's built-in browser are logged, page by page, with how long you stayed.</p>
        {f.sites.map((s) => <div key={s.domain} className="rowline"><span>{s.domain}</span><span className="sub">{s.n} visits</span></div>)}</div>}
    </section>}

    {f.youGave.length > 0 && <section className="sec"><h2>What you handed over</h2>
      <div className="grid g3">{f.youGave.map((g) => <div key={g.what} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><b style={{ fontSize: 18 }}>{g.what}</b><span className="what">{g.detail}</span></div>)}</div>
    </section>}

    <section className="dark" style={{ gap: 12 }}><h2>Make them show you the rest</h2><p style={{ margin: 0, fontSize: 16, opacity: .8, maxWidth: 720 }}>The export is what they choose to give you. A privacy access request makes each company list what it holds, where it came from and who it was shared with. Drafted for you, sent from your own email.</p><button className="btn" style={{ alignSelf: 'flex-start', background: '#C6F432', color: '#06080C', borderColor: '#C6F432' }} onClick={() => go('letters')}>Draft the letters →</button></section>
  </main>;
}

function prettyEvent(t: string) {
  const m: Record<string, string> = { LaunchAPP: 'opened the app', Login: 'logged in', Registration: 'signed up', Purchase: 'bought something', ViewContent: 'viewed a page', PAGE_VIEW: 'viewed a page', VIEW_CONTENT: 'viewed a product', ADD_TO_CART: 'added to cart', AddToCart: 'added to cart', InitiateCheckout: 'started checkout', CompleteRegistration: 'signed up', Search: 'searched', ACTIVATE_APP: 'opened the app', SubmitForm: 'submitted a form', Contact: 'contacted them', CompletePayment: 'paid', PlaceAnOrder: 'placed an order' };
  const l: Record<string, string> = { pageview: 'viewed a page', landingpageview: 'landed on their site', engagedsession: 'stayed a while', '50secsession': 'stayed 50+ seconds', enrichanm: 'matched your profile', enrichaam: 'matched your profile', addpaymentinfo: 'added payment info', clickbutton: 'clicked a button', lead: 'submitted a lead form', completepayment: 'paid', addtocart: 'added to cart', initiatecheckout: 'started checkout', viewcontent: 'viewed a product', launchapp: 'opened the app', login: 'logged in', registration: 'signed up', purchase: 'bought something', checkout: 'checked out', search: 'searched', subscribe: 'subscribed', download: 'downloaded something', contact: 'contacted them' };
  return m[t] ?? l[t.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? (/^event \d+$/.test(t) ? 'custom event' : t.replace(/_/g, ' ').toLowerCase());
}
