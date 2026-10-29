/** Shared by the Web Worker and the main-thread fallback. */
import { ZipArchive, MapArchive, MultiArchive, zipArchiveStreaming, defaultKeep, parseAll, buildReport, type Archive, type ParseResult, type Report } from '@bigbrother/core';

export const STREAM_ABOVE = 64 * 1024 * 1024; // zips bigger than this are streamed; media never touches memory

export async function runParse(files: File[], tz: string, prior: ParseResult[], post: (msg: string) => void): Promise<{ results: ParseResult[]; report: Report }> {
  if (!files.length) { // restore from device storage, or desktop collectors handing over already-parsed results
    if (!prior.length) throw new Error('Nothing to parse yet. Drop an export zip to start.');
    post('Rebuilding your file…'); const merged = mergeResults(prior); return { results: merged, report: buildReport(merged, tz) };
  }
  const archives: Archive[] = [];
  for (const f of files) {
    post(`Opening ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`);
    const isZip = /\.zip$/i.test(f.name) || await looksLikeZip(f);
    if (isZip && (f.size > STREAM_ABOVE || typeof f.stream === 'function' && f.size > 8 * 1024 * 1024)) {
      post(`Streaming ${f.name}, skipping photos and videos…`);
      archives.push(await zipArchiveStreaming(iterate(f.stream()), defaultKeep));
    } else if (isZip) archives.push(new ZipArchive(new Uint8Array(await f.arrayBuffer())));
    else archives.push(new MapArchive({ [(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name]: new Uint8Array(await f.arrayBuffer()) }));
  }
  const archive = new MultiArchive(archives);
  const n = archive.list().length;
  post(`${n.toLocaleString()} readable files inside. Detecting sources…`);
  if (n === 0) throw new Error('No readable files found. If this is a photos-only zip or an HTML export, request the JSON version (Accounts Center → Download your information → Format: JSON).');
  const results = await parseAll(archive, post);
  if (!results.length) { const sample = archive.list().slice(0, 12).join('\n  '); throw new Error(`Opened ${n} files but recognised no platform. First files:\n  ${sample}\n\nInstagram, TikTok, Google, Apple, Spotify, X, Snapchat, Uber, WhatsApp, dating and gaming exports are supported (JSON and HTML for Instagram). Send these file names to get the parser updated.`); }
  const merged = mergeResults(prior, results);
  post('Building your file…');
  const report = buildReport(merged, tz);
  return { results: merged, report };
}

async function looksLikeZip(f: File) { try { const b = new Uint8Array(await f.slice(0, 2).arrayBuffer()); return b[0] === 0x50 && b[1] === 0x4b; } catch { return false; } }
async function* iterate(s: ReadableStream<Uint8Array>) { const r = s.getReader(); for (;;) { const { done, value } = await r.read(); if (done) return; yield value; } }

/** Merge a new parse into earlier ones. Only events already present in `prior` are dropped (re-dropping the same zip);
 *  nothing inside a single export is deduped, since two messages can share a minute, a sender and a length. */
export function mergeResults(prior: ParseResult[], fresh: ParseResult[] = []): ParseResult[] {
  const key = (e: ParseResult['events'][number]) => `${e.source}|${e.ts}|${e.kind}|${e.title ?? ''}|${e.url ?? ''}|${e.actor ?? ''}|${e.value ?? ''}`;
  const seenPrior = new Set(prior.flatMap((r) => r.events.map(key)));
  const freshFiltered = fresh.map((r) => ({ ...r, events: r.events.filter((e) => !seenPrior.has(key(e))) }));
  const rs = [...prior, ...freshFiltered];
  const by: Record<string, ParseResult> = {};
  for (const r of rs) { const m = (by[r.source] ??= { source: r.source, events: [], claims: [], files: [], warnings: [] }); m.events.push(...r.events); m.claims.push(...r.claims); m.files.push(...r.files); m.warnings.push(...r.warnings); }
  for (const m of Object.values(by)) {
    const cs = new Set<string>(); m.claims = m.claims.filter((c) => { const k = `${c.field}|${c.value}`; if (cs.has(k)) return false; cs.add(k); return true; });
    m.warnings = [...new Set(m.warnings)]; m.files = [...new Set(m.files)];
  }
  return Object.values(by);
}

/** Expand a dropped folder (DataTransferItem.webkitGetAsEntry) into Files with relative paths. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.some((e) => e.isDirectory)) return Array.from(dt.files);
  const out: File[] = [];
  const walk = async (e: FileSystemEntry, prefix: string): Promise<void> => {
    if (e.isFile) { const f = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)); if (defaultKeep(f.name.toLowerCase())) out.push(new File([f], prefix + f.name, { type: f.type })); return; }
    const reader = (e as FileSystemDirectoryEntry).createReader();
    for (;;) { const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; for (const c of batch) await walk(c, prefix + e.name + '/'); }
  };
  for (const e of entries) await walk(e, '');
  return out;
}
