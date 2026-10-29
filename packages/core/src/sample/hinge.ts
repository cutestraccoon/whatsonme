import type { MapArchive } from '../util/archive.js';
import { archive, json, randomTs, rng, sqlTs } from './_rng.js';

/** Hinge data export: matches.json + user.json + prompts.json + media.json. */
export function makeHingeArchive(): MapArchive {
  const r = rng(555);
  const matches = Array.from({ length: 70 }, () => {
    const t0 = randomTs(r); const it: Record<string, unknown[]> = {};
    const liked = r.chance(0.75);
    if (liked) it.like = [{ timestamp: sqlTs(t0), like: [{ ...(r.chance(0.4) ? { comment: 'nice photo' } : {}) }] }];
    const matched = r.chance(liked ? 0.35 : 0.9);
    if (matched) {
      const tm = t0 + r.int(1, 72) * 3600000; it.match = [{ timestamp: sqlTs(tm) }];
      if (r.chance(0.7)) it.chats = Array.from({ length: r.int(1, 10) }, (_, i) => ({ body: r.pick(['hey :)', 'how is your week going', 'that sounds fun', 'ok sounds good, see you then']), timestamp: sqlTs(tm + (i + 1) * r.int(10, 600) * 60000) }));
      if (r.chance(0.3)) it.block = [{ block_type: 'remove', timestamp: sqlTs(tm + r.int(2, 20) * 86400000) }];
      if (r.chance(0.1)) it.we_met = [{ timestamp: sqlTs(tm + r.int(3, 15) * 86400000), did_meet_subject: 'Yes', was_my_type: 'Yes' }];
    }
    return it;
  }).filter((it) => Object.keys(it).length);
  return archive({
    'Hinge Data Export/matches.json': json(matches),
    'Hinge Data Export/user.json': json({ account: { phone_number: '+14165551234', email: 'alex@example.com', signup_time: '2022-09-01 14:00:00', last_active: sqlTs(randomTs(r)) }, profile: { first_name: 'Alex', birth_date: '1996-04-12 00:00:00', gender: 'man', gender_identity: 'man', height_centimeters: 180, ethnicities: ['Middle Eastern'], religions: ['Muslim'], job_title: 'Founder', workplaces: ['Stealth'], education_attained: 'Undergrad', hometowns: ['Toronto'], drinking: 'No', smoking: 'No', children: 'Don\'t have children', dating_intention: 'Long-term relationship' }, preferences: { age_min: 24, age_max: 34, distance_miles_max: 25, gender_preference: 'women' }, location: { latitude: 43.77, longitude: -79.34, country: 'CA' }, devices: [{ device_model: 'iPhone15,2', device_platform: 'ios', ip_address: '203.0.113.7' }] }),
    'Hinge Data Export/prompts.json': json([{ prompt: 'A life goal of mine', answer: '...' }]),
    'Hinge Data Export/media.json': json([{ type: 'photo', url: 'https://...' }]),
    'Hinge Data Export/index.html': '<html></html>',
  });
}
