/**
 * Run the core parsers over real-world sample exports.
 *   npx tsx scripts/run-samples.mts <dir-or-zip> [<dir-or-zip> ...]  [--json] [--examples N]
 * Each argument is loaded as one archive (directory => every file beneath it; .zip => ZipArchive) and
 * fed to parseAll. Prints detected sources, event counts by kind, claim counts by field, warnings and
 * a few example events, so the numbers can be compared with jq/grep counts over the raw files.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseAll, detectSources } from '../packages/core/src/parsers/index.js';
import { MapArchive, ZipArchive, defaultKeep } from '../packages/core/src/util/archive.js';
import type { Archive, Event } from '../packages/core/src/types.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const exIdx = args.indexOf('--examples');
const nExamples = exIdx >= 0 ? Number(args[exIdx + 1]) : 3;
const targets = args.filter((a, i) => !a.startsWith('--') && !(exIdx >= 0 && i === exIdx + 1));
if (!targets.length) { console.error('usage: tsx scripts/run-samples.mts <dir-or-zip> ...'); process.exit(2); }

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); const st = statSync(p); if (st.isDirectory()) walk(p, out); else out.push(p); }
  return out;
}

export function loadArchive(target: string): Archive {
  const abs = resolve(target);
  if (statSync(abs).isFile()) {
    if (abs.endsWith('.zip')) return new ZipArchive(new Uint8Array(readFileSync(abs)));
    return new MapArchive({ [abs.slice(abs.lastIndexOf('/') + 1)]: new Uint8Array(readFileSync(abs)) });
  }
  const files: Record<string, Uint8Array> = {};
  for (const f of walk(abs)) { const rel = relative(abs, f); if (!defaultKeep(rel.toLowerCase())) continue; files[rel] = new Uint8Array(readFileSync(f)); }
  return new MapArchive(files);
}

function count<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of xs) { const k = key(x); m[k] = (m[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}
function fmt(e: Event) {
  const { ts, meta, ...rest } = e;
  return JSON.stringify({ ts: new Date(ts).toISOString(), ...rest, meta }, null, 0).slice(0, 300);
}

for (const target of targets) {
  const a = loadArchive(target);
  const detected = detectSources(a).map((p) => p.source);
  const results = await parseAll(a);
  if (asJson) { console.log(JSON.stringify({ target, files: a.list().length, detected, results: results.map((r) => ({ source: r.source, events: r.events.length, kinds: count(r.events, (e) => e.kind), claims: count(r.claims, (c) => c.field), files: r.files, warnings: r.warnings })) }, null, 2)); continue; }
  console.log(`\n==== ${target}  (${a.list().length} files)`);
  console.log(`detected: ${detected.join(', ') || '(nothing)'}`);
  for (const r of results) {
    console.log(`\n-- source=${r.source}  events=${r.events.length}  claims=${r.claims.length}  files=${r.files.length}`);
    console.log('   kinds:', JSON.stringify(count(r.events, (e) => `${e.source}/${e.kind}`)));
    console.log('   claims:', JSON.stringify(count(r.claims, (c) => c.field)));
    console.log('   by file:', JSON.stringify(count(r.events, (e) => e.file)));
    for (const w of r.warnings) console.log('   WARN:', w);
    const step = Math.max(1, Math.floor(r.events.length / nExamples));
    for (let i = 0; i < r.events.length && i / step < nExamples; i += step) console.log('   ex:', fmt(r.events[i]));
    for (const c of r.claims.slice(0, nExamples)) console.log('   claim:', JSON.stringify(c).slice(0, 200));
  }
}
