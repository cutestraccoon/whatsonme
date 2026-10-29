import { describe, expect, it } from 'vitest';
import { apple } from '../../src/parsers/apple.js';
import { real } from './_load.js';

describe('real: apple health export.xml (dogsheep/healthkit-to-sqlite excerpt)', () => {
  it('reads multi-line <Record> with MetadataEntry children, <Workout>, and <Me>', async () => {
    const a = real('apple-health');
    expect(apple.detect(a.list())).toBe(true);
    const r = await apple.parse(a);
    const titles = r.events.map((e) => e.title).sort();
    expect(titles).toEqual(['BodyMassIndex', 'HeartRate', 'workout']);
    expect(r.events.find((e) => e.title === 'HeartRate')?.value).toBe(72);
    expect(r.events.find((e) => e.title === 'workout')?.actor).toBe('Running');
    expect(r.claims.find((c) => c.field === 'declared_birth_year')?.value).toBe('1990');
    expect(r.claims.find((c) => c.field === 'declared_gender')?.value).toBe('male');
    expect(r.claims.find((c) => c.field === 'health_records')?.value).toBe('2');
  });
});
