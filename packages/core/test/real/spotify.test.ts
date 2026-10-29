import { describe, expect, it } from 'vitest';
import { spotify } from '../../src/parsers/spotify.js';
import { real } from './_load.js';

describe('real: spotify', () => {
  it('account-data StreamingHistory0.json (2019) and extended Streaming_History_Audio (2025)', async () => {
    const a = real('spotify');
    expect(spotify.detect(a.list())).toBe(true);
    const r = await spotify.parse(a);
    const short = r.events.filter((e) => /streaminghistory0/.test(e.file));
    const ext = r.events.filter((e) => /streaming_history_audio/.test(e.file));
    expect(short.length).toBe(200);
    expect(ext.length).toBe(39);
    expect(short[0].title).toBe('Channel 1 Suite - Live at the Barbican');
    expect(short[0].ts).toBe(Date.UTC(2019, 11, 10, 22, 22) - 324136);
    expect(ext[0].actor).toBe('fripSide');
    expect(ext[0].meta?.skipped).toBe(true);
    expect(ext[0].meta?.ip).toBe('x.x.•.•');
    expect(r.claims.find((c) => c.field === 'conn_country')?.value).toBe('US');
  });
});
