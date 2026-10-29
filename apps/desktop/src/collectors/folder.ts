import fs from 'node:fs';
import path from 'node:path';
import type { Archive } from '../core.ts';

const dec = new TextDecoder('utf-8');

/** Default: skip media and other binaries (most of the bytes in an export) so list() stays cheap. */
export function defaultFolderKeep(rel: string): boolean {
  const ext = rel.slice(rel.lastIndexOf('.') + 1);
  return ['json', 'js', 'csv', 'txt', 'html', 'htm', 'xml', 'tsv', 'vcf', 'ics', 'sqlite', 'db'].includes(ext);
}

/**
 * Archive backed by an extracted export folder on disk.
 * Paths are lower-cased, forward-slash, relative to the root. Reads are lazy (fs on demand).
 */
export class FolderArchive implements Archive {
  private names: string[] = [];
  /** lower-cased relative path -> absolute path on disk (original casing) */
  private abs = new Map<string, string>();
  private sizes = new Map<string, number>();

  constructor(public readonly root: string, keep: (rel: string) => boolean = defaultFolderKeep) {
    this.root = path.resolve(root);
    this.walk(this.root, keep);
    this.names.sort();
  }

  private walk(dir: string, keep: (rel: string) => boolean) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue; // never follow links out of the folder
      if (e.isDirectory()) { this.walk(full, keep); continue; }
      if (!e.isFile()) continue;
      const rel = path.relative(this.root, full).split(path.sep).join('/').toLowerCase();
      if (!keep(rel)) continue;
      let size = 0; try { size = fs.statSync(full).size; } catch { continue; }
      this.names.push(rel); this.abs.set(rel, full); this.sizes.set(rel, size);
    }
  }

  private norm(p: string) { return p.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase(); }
  private resolve(p: string): string { const a = this.abs.get(this.norm(p)); if (!a) throw new Error('missing ' + p); return a; }

  list() { return this.names; }
  async text(p: string) { return dec.decode(await fs.promises.readFile(this.resolve(p))); }
  async bytes(p: string) { return new Uint8Array(await fs.promises.readFile(this.resolve(p))); }
  size(p: string) { return this.sizes.get(this.norm(p)) ?? 0; }
}
