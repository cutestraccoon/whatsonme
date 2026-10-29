/** Writes synthetic export zips to a folder so you can try the app without real data.  Usage: npx tsx packages/core/test/fixtures/write-zips.ts <outdir> */
import { zipSync } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeInstagramArchive, makeTikTokArchive, makeGoogleArchive, makeAppleArchive } from './core.js';

const out = process.argv[2] ?? 'sample-exports';
mkdirSync(out, { recursive: true });
const dump = async (name: string, a: { list(): string[]; bytes(p: string): Promise<Uint8Array> }) => {
  const files: Record<string, Uint8Array> = {};
  for (const p of a.list()) files[p] = await a.bytes(p);
  writeFileSync(join(out, name), zipSync(files, { level: 6 }));
  console.log('wrote', join(out, name), Object.keys(files).length, 'files');
};
await dump('instagram-sample.zip', makeInstagramArchive());
await dump('user_data_tiktok-sample.zip', makeTikTokArchive());
await dump('takeout-sample.zip', makeGoogleArchive());
await dump('apple-sample.zip', makeAppleArchive());
