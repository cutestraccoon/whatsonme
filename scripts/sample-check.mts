import { sampleExports, parseAll, buildReport } from '../packages/core/src/index.ts';
const results = [] as any[];
for (const s of sampleExports()) { const r = await parseAll(s.archive); for (const x of r) { results.push(x); console.log(s.id, '→', x.source, x.events.length, 'events', x.claims.length, 'claims', (x.warnings || []).slice(0, 1)); } if (!r.length) console.log(s.id, '→ NOTHING DETECTED'); }
const rep = buildReport(results, 'America/Toronto');
console.log('verdict:', rep.verdict); console.log('summary:', rep.summary); console.log('sources', rep.sources.map((s: any) => s.source));
console.log('dossier', rep.dossier.length, 'portrait', rep.portrait.length, 'finds', rep.finds.length, 'holdings', rep.flows.holdings.length, 'routine home', !!rep.routine.home, 'social', rep.social.length, 'wrapped hours', rep.wrapped.hours, 'advertisers', rep.flows.advertisers.total, 'partners', rep.flows.partnerTotal);
