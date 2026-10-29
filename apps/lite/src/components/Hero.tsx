import type { ReactNode } from 'react';

export const C = { ink: '#06080C', cream: '#F4F1EA', orange: '#FF7A1A', lime: '#C6F432', cyan: '#4CC9F0', purple: '#B47CFF', pink: '#FF5C8A' };
type Tone = keyof typeof C;

/** One Wrapped slide, laid flat at the top of a page: flat colour, blobs, one big line. */
export function Hero({ tone, accent, kicker, title, lead, children }: { tone: Tone; accent: Tone; kicker?: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  const dark = tone === 'ink';
  return <section className={'hero' + (dark ? ' on-dark' : '')} style={{ background: C[tone] }}>
    <div className="blob b1" style={{ background: C[accent] }} aria-hidden="true" />
    <div className="blob b2" style={{ borderColor: dark ? C.cream : C.ink }} aria-hidden="true" />
    <div className="blob b3" style={{ background: dark ? C.cream : C.ink }} aria-hidden="true" />
    {kicker && <p className="eyebrow">{kicker}</p>}
    <h1>{title}</h1>
    {lead && <p className="lead">{lead}</p>}
    {children}
  </section>;
}
