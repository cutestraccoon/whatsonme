import fs from 'node:fs';
import path from 'node:path';
import { ZipArchive, zipArchiveStreaming, MapArchive, defaultKeep, type Archive } from '../core.ts';
import { FolderArchive } from './folder.ts';

/** Zips up to this size are unzipped in memory; larger ones are streamed and only text files kept. */
export const IN_MEMORY_ZIP_LIMIT = 400 * 1024 * 1024;

export interface OpenedArchive { archive: Archive; mode: 'zip' | 'zip-streaming' | 'folder' | 'file'; bytes: number }

/** Open a local zip, folder or single export file (export.xml, *.json, *.txt) as a core Archive. */
export async function openLocalArchive(p: string): Promise<OpenedArchive> {
  const st = fs.statSync(p);
  if (st.isDirectory()) return { archive: new FolderArchive(p), mode: 'folder', bytes: 0 };
  if (!st.isFile()) throw new Error('not a file or folder: ' + p);
  const lower = p.toLowerCase();
  if (lower.endsWith('.zip')) {
    if (st.size <= IN_MEMORY_ZIP_LIMIT) {
      return { archive: new ZipArchive(new Uint8Array(fs.readFileSync(p))), mode: 'zip', bytes: st.size };
    }
    const stream = fs.createReadStream(p, { highWaterMark: 4 * 1024 * 1024 });
    const chunks = (async function* () { for await (const c of stream) yield new Uint8Array(c as Buffer); })();
    return { archive: await zipArchiveStreaming(chunks, defaultKeep), mode: 'zip-streaming', bytes: st.size };
  }
  // Single file (e.g. apple export.xml, a WhatsApp chat .txt, one Instagram json): wrap as a 1-file archive.
  const name = path.basename(p).toLowerCase();
  return { archive: new MapArchive({ [name]: new Uint8Array(fs.readFileSync(p)) }), mode: 'file', bytes: st.size };
}
