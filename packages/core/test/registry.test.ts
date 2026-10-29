import { describe, expect, it } from 'vitest';
import { detectSources, parsers } from '../src/parsers/index.js';
import { makeSpotifyArchive } from './fixtures/spotify.js';
import { makeXArchive } from './fixtures/x.js';
import { makeSnapchatArchive } from './fixtures/snapchat.js';
import { makeUberArchive } from './fixtures/uber.js';
import { makeWhatsappArchive } from './fixtures/whatsapp.js';
import { makeTinderArchive } from './fixtures/tinder.js';
import { makeHingeArchive } from './fixtures/hinge.js';
import { makeBumbleArchive } from './fixtures/bumble.js';
import { makeSteamArchive } from './fixtures/steam.js';
import { makeDiscordArchive } from './fixtures/discord.js';

describe('parser registry', () => {
  it('registers every new parser exactly once', () => {
    const srcs = parsers.map((p) => p.source);
    for (const s of ['spotify', 'x', 'snapchat', 'uber', 'whatsapp', 'tinder', 'hinge', 'bumble', 'steam', 'discord']) expect(srcs.filter((x) => x === s).length, s).toBe(1);
  });
  it('each fixture is detected only by its own parser (no cross-talk)', () => {
    const cases: [string, () => { list(): string[] }][] = [
      ['spotify', makeSpotifyArchive], ['x', makeXArchive], ['snapchat', makeSnapchatArchive], ['uber', makeUberArchive], ['whatsapp', makeWhatsappArchive],
      ['tinder', makeTinderArchive], ['hinge', makeHingeArchive], ['bumble', makeBumbleArchive], ['steam', makeSteamArchive], ['discord', makeDiscordArchive],
    ];
    for (const [src, mk] of cases) {
      const found = detectSources(mk() as any).map((p) => p.source);
      expect(found, src).toEqual([src]);
    }
  });
});
