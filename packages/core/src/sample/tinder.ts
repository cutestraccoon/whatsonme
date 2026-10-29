import type { MapArchive } from '../util/archive.js';
import { DAY, END, START, archive, json, randomTs, rng, ymd } from './_rng.js';

/** Tinder's "Tue, 12 Mar 2024 10:21:33 GMT" */
const rfc = (ms: number) => new Date(ms).toUTCString();

/** Tinder "Download my data": one data.json. */
export function makeTinderArchive(): MapArchive {
  const r = rng(1312);
  const daily = (lo: number, hi: number, p: number) => { const m: Record<string, number> = {}; for (let t = START; t <= END; t += DAY) if (r.chance(p)) m[ymd(t)] = r.int(lo, hi); return m; };
  const Usage = { app_opens: daily(1, 12, 0.7), swipes_likes: daily(2, 40, 0.6), swipes_passes: daily(5, 80, 0.6), superlikes: daily(1, 1, 0.05), matches: daily(1, 4, 0.3), messages_sent: daily(1, 15, 0.35), messages_received: daily(1, 12, 0.35), advertising_id: {}, idfa: {} };
  const Messages = Array.from({ length: 18 }, (_, i) => ({ match_id: `Match ${i + 1}`, messages: Array.from({ length: r.int(2, 12) }, () => ({ to: 100 + i, from: 1, message: r.pick(['hey!', 'how was your weekend?', 'that place on Ossington is great', 'haha same']), sent_date: rfc(randomTs(r)), type: 'text' })) }));
  return archive({
    'data.json': json({
      Usage, Messages,
      User: { active_time: rfc(END), age_filter_max: 34, age_filter_min: 24, birth_date: rfc(Date.UTC(1996, 3, 12)), create_date: rfc(Date.UTC(2021, 5, 2, 12)), gender: 'M', gender_filter: 'F', interested_in: 'F', city: { name: 'Toronto', region: 'Ontario' }, email: 'alex@example.com', phone_id: '+14165551234', ip_address: '203.0.113.7', pos: { lat: 43.77, lon: -79.34 }, jobs: [{ title: { name: 'Founder', displayed: true }, company: { name: 'Stealth', displayed: false } }], schools: [{ name: 'University of Toronto', displayed: true }], interests: ['Live Music', 'Cooking'], bio: '...' },
      Spotify: { spotify_connected: true, spotify_top_artists: [] }, Purchases: { subscription: [{ create_date: rfc(randomTs(r)), product_type: 'plus', expire_date: rfc(END) }], consumable: [], boost_tracking: [], super_like_tracking: [] },
      Campaigns: { current_campaigns: [], expired_campaigns: [] }, Experiences: {}, RoomsAndInteractions: { rooms: [] }, SwipeNotes: [], SwipeParty: {}, StudentVerifications: {},
    }),
    'index.html': '<html></html>',
    'photos/photo1.jpg': new Uint8Array([0xff, 0xd8]),
  });
}
