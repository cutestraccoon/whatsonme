import { describe, expect, it } from 'vitest';
import { hinge } from '../../src/parsers/dating.js';
import { by, real } from './_load.js';

describe('real-shaped: hinge matches.json (spottseng/hinge-data-analysis, 2025)', () => {
  it('detects a lone matches.json and counts match/chats/block/like', async () => {
    const a = real('hinge');
    expect(hinge.detect(a.list())).toBe(true);
    const r = await hinge.parse(a);
    expect(by(r.events, 'match')).toBe(3);
    expect(by(r.events, 'message')).toBe(6);
    expect(by(r.events, 'swipe')).toBe(1);
    expect(r.events.filter((e) => e.meta?.what === 'block').length).toBe(3);
    expect(r.events[0].ts).toBe(Date.UTC(2025, 3, 23, 14, 53, 1));
    expect(r.claims.find((c) => c.field === 'unmatched_count')?.value).toBe('3');
    expect(r.warnings).toEqual([]);
  });
});
