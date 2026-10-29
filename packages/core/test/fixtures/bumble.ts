import type { MapArchive } from '../../src/util/archive.js';
import { NAMES, archive, iso, json, randomTs, rng } from './_rng.js';

/** Bumble GDPR export (format varies; this mimics the JSON+CSV mix users have reported). */
export function makeBumbleArchive(): MapArchive {
  const r = rng(808);
  const votes = Array.from({ length: 120 }, () => ({ date: iso(randomTs(r)), vote: r.pick(['yes', 'no', 'no', 'superswipe']) }));
  const matches = Array.from({ length: 25 }, () => ({ matched_at: iso(randomTs(r)), name: r.pick(NAMES) }));
  const csvRows = Array.from({ length: 80 }, () => `${iso(randomTs(r))},${r.pick(NAMES)},${r.pick(['outgoing', 'incoming'])},"${r.pick(['hey there', 'what are you up to this weekend?', 'haha nice', 'sure, let us do it'])}"`);
  return archive({
    'bumble_data/profile.json': json({ profile: { name: 'Alex', birthday: '1996-04-12', gender: 'Male', looking_for: 'Women', city: 'Toronto', email: 'alex@example.com', phone: '+14165551234', work: 'Founder', education: 'University of Toronto' } }),
    'bumble_data/votes.json': json({ votes }),
    'bumble_data/matches.json': json({ matches }),
    'bumble_data/messages.csv': ['date_time,match_name,direction,message', ...csvRows].join('\n') + '\n',
    'bumble_data/README.txt': 'Your Bumble data',
  });
}
