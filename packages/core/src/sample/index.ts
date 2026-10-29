/** Synthetic exports for every supported source, so the app can be tried without real data. Deterministic; nothing here is a real person. */
import { zipSync } from 'fflate';
import type { Archive } from '../types.js';
import { makeInstagramArchive, makeTikTokArchive, makeGoogleArchive, makeAppleArchive } from './core.js';
import { makeSpotifyArchive } from './spotify.js';
import { makeXArchive } from './x.js';
import { makeSnapchatArchive } from './snapchat.js';
import { makeUberArchive } from './uber.js';
import { makeWhatsappArchive } from './whatsapp.js';
import { makeTinderArchive } from './tinder.js';
import { makeHingeArchive } from './hinge.js';
import { makeBumbleArchive } from './bumble.js';
import { makeSteamArchive } from './steam.js';
import { makeDiscordArchive } from './discord.js';

export interface SampleExport { id: string; label: string; zipName: string; archive: Archive }

export function sampleExports(): SampleExport[] {
  return [
    { id: 'instagram', label: 'Instagram', zipName: 'instagram-sample.zip', archive: makeInstagramArchive() },
    { id: 'tiktok', label: 'TikTok', zipName: 'user_data_tiktok-sample.zip', archive: makeTikTokArchive() },
    { id: 'google', label: 'Google Takeout', zipName: 'takeout-sample.zip', archive: makeGoogleArchive() },
    { id: 'apple', label: 'Apple + Health', zipName: 'apple-sample.zip', archive: makeAppleArchive() },
    { id: 'spotify', label: 'Spotify', zipName: 'my_spotify_data-sample.zip', archive: makeSpotifyArchive() },
    { id: 'x', label: 'X', zipName: 'twitter-sample.zip', archive: makeXArchive() },
    { id: 'snapchat', label: 'Snapchat', zipName: 'mydata-snapchat-sample.zip', archive: makeSnapchatArchive() },
    { id: 'uber', label: 'Uber', zipName: 'uber-sample.zip', archive: makeUberArchive() },
    { id: 'whatsapp', label: 'WhatsApp', zipName: 'whatsapp-chat-sample.zip', archive: makeWhatsappArchive() },
    { id: 'tinder', label: 'Tinder', zipName: 'tinder-sample.zip', archive: makeTinderArchive() },
    { id: 'hinge', label: 'Hinge', zipName: 'hinge-sample.zip', archive: makeHingeArchive() },
    { id: 'bumble', label: 'Bumble', zipName: 'bumble-sample.zip', archive: makeBumbleArchive() },
    { id: 'steam', label: 'Steam', zipName: 'steam-sample.zip', archive: makeSteamArchive() },
    { id: 'discord', label: 'Discord', zipName: 'discord-package-sample.zip', archive: makeDiscordArchive() },
  ];
}

/** Each sample as zip bytes, exactly like a downloaded export. */
export async function sampleZips(): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const s of sampleExports()) {
    const files: Record<string, Uint8Array> = {};
    for (const p of s.archive.list()) files[p] = await s.archive.bytes(p);
    out.push({ name: s.zipName, bytes: zipSync(files, { level: 1 }) });
  }
  return out;
}
