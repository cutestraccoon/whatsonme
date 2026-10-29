import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapArchive, ZipArchive } from '../../src/util/archive.js';

/** Sanitized excerpts of real exports live in test/fixtures/real/. A .zip loads as ZipArchive, a folder as MapArchive. */
export function real(name: string) {
  const root = join(fileURLToPath(new URL('../fixtures/real/', import.meta.url)), name);
  if (statSync(root).isFile()) return new ZipArchive(new Uint8Array(readFileSync(root)));
  const files: Record<string, Uint8Array> = {};
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files[relative(root, p)] = new Uint8Array(readFileSync(p)); } };
  walk(root);
  return new MapArchive(files);
}
export const by = <T extends { kind?: string; field?: string }>(xs: T[], k: string) => xs.filter((x) => (x.kind ?? x.field) === k).length;
