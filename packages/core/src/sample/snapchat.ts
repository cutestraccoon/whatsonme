import type { MapArchive } from '../util/archive.js';
import { INTERESTS, NAMES, archive, json, randomTs, rng } from './_rng.js';

/** Snapchat's "2024/03/12 10:21:33 UTC" */
function snapTs(ms: number): string { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`; }

/** Snapchat "My Data" JSON flavour (json/*.json). */
export function makeSnapchatArchive(): MapArchive {
  const r = rng(99);
  const loc = () => `${(43.65 + r.next() * 0.2).toFixed(6)} ± ${r.int(5, 60)}.0, ${(-79.5 + r.next() * 0.3).toFixed(6)} ± ${r.int(5, 60)}.0`;
  const locations = Array.from({ length: 80 }, () => ({ Time: snapTs(randomTs(r)), 'Latitude, Longitude': loc() }));
  const areas = Array.from({ length: 10 }, () => ({ Time: snapTs(randomTs(r)), Name: r.pick(['Don Mills', 'Yorkville', 'Kensington Market', 'Liberty Village']), 'Latitude, Longitude': loc() }));
  const logins = Array.from({ length: 25 }, () => ({ IP: `99.2${r.int(10, 55)}.${r.int(0, 255)}.${r.int(0, 255)}`, Country: 'CA', Created: snapTs(randomTs(r)), Status: 'Successful', Device: r.pick(['iPhone 14 Pro', 'Pixel 7']) }));
  const chat = (dir: 'From' | 'To') => Array.from({ length: 40 }, () => ({ [dir]: r.pick(NAMES).toLowerCase() + '_snap', 'Media Type': r.pick(['TEXT', 'TEXT', 'MEDIA', 'STICKER']), Created: snapTs(randomTs(r)), Content: r.chance(0.7) ? 'lol ok see you at ' + r.int(6, 11) : '' }));
  return archive({
    'index.html': '<html></html>',
    'json/location_history.json': json({ 'Location History': locations, 'Areas you may have visited': areas, 'Businesses and public places you may have visited': [] }),
    'json/account_history.json': json({ 'Login History': logins, 'Display Name Change': [], 'Email Change': [], 'Account deactivated / reactivated': [], 'Spectacles': [] }),
    'json/account.json': json({ 'Basic Information': { Username: 'alexsample', Name: 'Alex', 'Creation Date': '2014/08/02 15:00:12 UTC', Email: 'alex@example.com', 'Phone Number': '+1 416 555 1234', Birthday: '1996-04-12', Country: 'CA' }, 'Device Information': { Make: 'Apple', Model: 'iPhone15,2' } }),
    'json/friends.json': json({ Friends: Array.from({ length: 63 }, (_, i) => ({ Username: 'friend' + i, 'Display Name': r.pick(NAMES), 'Creation Timestamp': snapTs(randomTs(r)), 'Last Modified Timestamp': snapTs(randomTs(r)), Source: 'camera roll' })), 'Friend Requests Sent': [{ Username: 'x' }], 'Blocked Users': [], 'Deleted Friends': [{ Username: 'y' }, { Username: 'z' }] }),
    'json/chat_history.json': json({ 'Received Saved Chat History': chat('From'), 'Sent Saved Chat History': chat('To') }),
    'json/story_history.json': json({ 'Your Story Views': Array.from({ length: 30 }, () => ({ Name: r.pick(NAMES).toLowerCase() + '_snap', Date: snapTs(randomTs(r)) })), 'Your Stories': Array.from({ length: 12 }, () => ({ 'Media Type': 'IMAGE', 'Date Created': snapTs(randomTs(r)) })) }),
    'json/ad_interests.json': json({ 'Ad Interests': INTERESTS, 'Interest Categories': ['Lifestyle Interests - Tech Enthusiasts', 'Shopping - Home & Garden'] }),
  });
}
