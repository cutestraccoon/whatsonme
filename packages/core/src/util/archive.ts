import { unzipSync, Unzip, UnzipInflate } from 'fflate';
import type { Archive } from '../types.js';

const dec = new TextDecoder('utf-8');

/** Zip held in memory (browser + Node). Good up to a few hundred MB. */
export class ZipArchive implements Archive {
  private files: Record<string, Uint8Array>;
  private names: string[];
  constructor(data: Uint8Array, keep: (name: string) => boolean = defaultKeep) {
    // Skip media at inflate time: photos/videos are most of the bytes and no parser reads them.
    const raw = unzipSync(data, { filter: (f) => !f.name.endsWith('/') && keep(norm(f.name)) });
    this.files = {};
    for (const k of Object.keys(raw)) this.files[norm(k)] = raw[k];
    this.names = Object.keys(this.files);
  }
  list() { return this.names; }
  async text(p: string) { return dec.decode(this.files[norm(p)]); }
  async bytes(p: string) { return this.files[norm(p)]; }
  size(p: string) { return this.files[norm(p)]?.length ?? 0; }
}

/**
 * Streaming zip reader for very large Takeout zips: keeps only files that pass `keep`.
 * Media (jpg/mp4) is skipped by default, which is most of the bytes.
 */
export async function zipArchiveStreaming(
  chunks: AsyncIterable<Uint8Array> | Uint8Array,
  keep: (name: string) => boolean = defaultKeep,
): Promise<Archive> {
  const files: Record<string, Uint8Array> = {};
  const parts: Record<string, Uint8Array[]> = {};
  await new Promise<void>((resolve, reject) => {
    const uz = new Unzip((file) => {
      const name = norm(file.name);
      if (file.name.endsWith('/') || !keep(name)) return;
      parts[name] = [];
      file.ondata = (err, data, final) => {
        if (err) return reject(err);
        parts[name].push(data);
        if (final) {
          files[name] = concat(parts[name]);
          delete parts[name];
        }
      };
      file.start();
    });
    uz.register(UnzipInflate);
    (async () => {
      if (chunks instanceof Uint8Array) { uz.push(chunks, true); }
      else { for await (const c of chunks) uz.push(c, false); uz.push(new Uint8Array(0), true); }
      resolve();
    })().catch(reject);
  });
  return new MapArchive(files);
}

export class MapArchive implements Archive {
  private names: string[];
  private files: Record<string, Uint8Array>;
  constructor(files: Record<string, Uint8Array>) {
    this.files = {};
    for (const k of Object.keys(files)) this.files[norm(k)] = files[k];
    this.names = Object.keys(this.files);
  }
  list() { return this.names; }
  async text(p: string) { return dec.decode(this.files[norm(p)]); }
  async bytes(p: string) { return this.files[norm(p)]; }
  size(p: string) { return this.files[norm(p)]?.length ?? 0; }
}

/** Several archives (e.g. user dropped 3 zips) presented as one. */
export class MultiArchive implements Archive {
  private names: string[];
  private owner = new Map<string, Archive>();
  constructor(private parts: Archive[]) {
    // Index once: parsers call text() per file, and a linear includes() per call was O(files²).
    for (const a of parts) for (const n of a.list()) if (!this.owner.has(n)) this.owner.set(n, a);
    this.names = [...this.owner.keys()];
  }
  list() { return this.names; }
  private find(p: string) { return this.owner.get(norm(p)); }
  async text(p: string) { const a = this.find(p); if (!a) throw new Error('missing ' + p); return a.text(p); }
  async bytes(p: string) { const a = this.find(p); if (!a) throw new Error('missing ' + p); return a.bytes(p); }
  size(p: string) { return this.find(p)?.size(p) ?? 0; }
}

export function defaultKeep(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  return ['json', 'js', 'csv', 'txt', 'html', 'htm', 'xml', 'tsv', 'vcf', 'ics'].includes(ext);
}

export function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function concat(arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
