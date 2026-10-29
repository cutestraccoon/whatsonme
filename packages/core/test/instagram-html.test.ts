import { describe, it, expect } from 'vitest';
import { instagram, detectSources } from '../src/parsers/index.js';
import { MapArchive } from '../src/util/archive.js';
import { findStamp, parseEntries } from '../src/parsers/instagram-html.js';
import { buildReport } from '../src/insights/index.js';

const enc = new TextEncoder();
const page = (title: string, body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>._a6-g{}</style></head><body><div class="_a705"><div class="_3a-a"><div class="_3-8y _3-94 _a6-c">${body}</div></div></div></body></html>`;
const entry = (header: string, rows: [string, string][], stamp?: string, extra = '') =>
  `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><div class="_3-95 _2pim _a6-h _a6-i">${header}</div><div class="_3-95 _a6-p"><div><div>${extra}<table><tbody>${rows.map(([k, v]) => `<tr><td class="_2pin _a6_q"><div>${k}</div></td><td class="_2pin _2piu _a6_r"><div>${v}</div></td></tr>`).join('')}</tbody></table></div>${stamp ? `<div class="_3-94 _a6-o"><div class="_a72d">${stamp}</div></div>` : ''}</div></div></div>`;
const stampAt = (d: number, h: number) => { const dt = new Date(Date.UTC(2026, 0, 5 + d, h, 48, 10)); const mo = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); const hh = ((h + 11) % 12) + 1; return `${mo} ${dt.getUTCDate()}, 2026 ${hh}:48 ${h >= 12 ? 'pm' : 'am'}`; };

function makeHtmlArchive() {
  const f: Record<string, Uint8Array> = {};
  f['start_here.html'] = enc.encode(page('Start here', '<p>Your information</p>'));
  f['your_instagram_activity/likes/liked_posts.html'] = enc.encode(page('Liked posts', Array.from({ length: 60 }, (_, i) => entry(`creator_${i % 5}`, [], stampAt(i % 30, 23), `<a href="https://www.instagram.com/p/x${i}/">https://www.instagram.com/p/x${i}/</a>`)).join('')));
  f['ads_information/ads_and_topics/videos_watched.html'] = enc.encode(page('Videos watched', Array.from({ length: 300 }, (_, i) => entry('', [['Author', `creator_${i % 7}`], ['Time', stampAt(i % 60, [22, 23, 0, 13][i % 4])]])).join('')));
  f['ads_information/ads_and_topics/ads_viewed.html'] = enc.encode(page('Ads viewed', Array.from({ length: 40 }, (_, i) => entry('', [['Author', `brand_${i % 3}`], ['Time', stampAt(i, 21)]])).join('')));
  f['logged_information/recent_searches/word_or_phrase_searches.html'] = enc.encode(page('Searches', ['condo tour toronto', 'mortgage calculator', 'cs2 config'].map((q, i) => entry('', [['Search', q], ['Time', stampAt(i * 3, 12)]])).join('')));
  f['preferences/your_topics/your_topics.html'] = enc.encode(page('Your topics', ['Real Estate', 'Electric Vehicles', 'Small Business Owners'].map((t) => entry('', [['Name', t]])).join('')));
  f['ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.html'] = enc.encode(page('Advertisers', `<table><tr><th>Advertiser name</th><th>Has data file custom audience</th><th>Has remarketing custom audience</th><th>Has in-person store visit</th></tr><tr><td>Rogers</td><td>Yes</td><td>No</td><td>No</td></tr><tr><td>Hinge</td><td>Yes</td><td>No</td><td>No</td></tr><tr><td>Shop A</td><td>No</td><td>Yes</td><td>No</td></tr></table>`));
  f['apps_and_websites_off_of_instagram/apps_and_websites/your_activity_off_meta_technology.html'] = enc.encode(page('Off-Meta', entry('Shopping App', [], undefined, Array.from({ length: 25 }, (_, i) => `<div><div>PAGE_VIEW</div><div>${stampAt(i, 21)}</div></div>`).join('')) + entry('Bank App', [], undefined, Array.from({ length: 12 }, (_, i) => `<div><div>ACTIVATE_APP</div><div>${stampAt(i * 2, 8)}</div></div>`).join(''))));
  f['personal_information/information_about_you/profile_based_in.html'] = enc.encode(page('Based in', entry('', [['City Name', 'Toronto, Ontario']])));
  f['personal_information/personal_information/personal_information.html'] = enc.encode(page('Personal', entry('', [['Username', 'ferris'], ['Gender', 'Male'], ['Email', 'ferris@example.com']])));
  f['security_and_login_information/login_and_profile/login_activity.html'] = enc.encode(page('Logins', Array.from({ length: 20 }, (_, i) => entry('', [['IP Address', `99.230.1.${i % 5}`], ['Time', stampAt(i, 9)], ['User Agent', 'Instagram 300.0 (iPhone15,2; iOS 18)']])).join('')));
  f['connections/followers_and_following/followers_1.html'] = enc.encode(page('Followers', Array.from({ length: 140 }, (_, i) => entry(`user_${i}`, [], stampAt(i % 20, 10))).join('')));
  f['connections/contacts/synced_contacts.html'] = enc.encode(page('Contacts', Array.from({ length: 77 }, (_, i) => entry(`Contact ${i}`, [['First name', 'A'], ['Last name', 'B']])).join('')));
  f['media/posts/202601/x.jpg'] = new Uint8Array([0xff, 0xd8]);
  return new MapArchive(f);
}

describe('instagram html export', () => {
  it('reads the timestamp formats Meta writes', () => {
    expect(findStamp('Mar 17, 2026 11:48 pm')).toBe(Date.UTC(2026, 2, 17, 23, 48)); expect(findStamp('Mar 17, 2026, 12:05 AM')).toBe(Date.UTC(2026, 2, 17, 0, 5)); expect(findStamp('Jan 5, 2026 9:01:33 am')).toBe(Date.UTC(2026, 0, 5, 9, 1, 33)); expect(findStamp('no date')).toBeNull();
  });
  it('splits entries and reads key/value rows', () => {
    const es = parseEntries(page('x', entry('creator_1', [['Author', 'someone'], ['Time', 'Mar 17, 2026 11:48 pm']])));
    expect(es.length).toBe(1); expect(es[0].header).toBe('creator_1'); expect(es[0].kv.Author).toBe('someone'); expect(es[0].ts).toBe(Date.UTC(2026, 2, 17, 23, 48));
  });
  it('detects and parses a full HTML archive', async () => {
    const a = makeHtmlArchive(); expect(detectSources(a).map((p) => p.source)).toEqual(['instagram']);
    const r = await instagram.parse(a); const k: Record<string, number> = {}; for (const e of r.events) k[e.kind] = (k[e.kind] ?? 0) + 1;
    expect(k.like).toBe(60); expect(k.watch).toBe(300); expect(k.ad_view).toBe(40); expect(k.search).toBe(3); expect(k.login).toBe(20); expect(k.off_platform).toBe(37);
    expect(r.claims.filter((c) => c.field === 'topic').length).toBe(3); expect(r.claims.filter((c) => c.field === 'advertiser_audience').length).toBe(3); expect(r.claims.find((c) => c.value === 'Rogers')?.meta?.uploaded_list).toBe(true);
    expect(r.claims.find((c) => c.field === 'profile_based_in')?.value).toBe('Toronto, Ontario'); expect(r.claims.find((c) => c.field === 'followers_count')?.value).toBe('140'); expect(r.claims.find((c) => c.field === 'synced_contacts_count')?.value).toBe('77');
    expect(r.claims.find((c) => c.field === 'declared_email')?.value).not.toContain('ferris@example'); expect(r.events.find((e) => e.kind === 'login')?.meta?.ip).toBe('99.230.•.•');
    expect(r.warnings.some((w) => /HTML export/.test(w))).toBe(true); expect(r.events.every((e) => e.ts > Date.UTC(2025, 0, 1) && e.ts < Date.UTC(2027, 0, 1))).toBe(true);
    const rep = buildReport([r], 'America/Toronto'); expect(rep.totals.events).toBeGreaterThan(400); expect(rep.snitches.find((s) => s.name === 'Rogers')?.kind).toBe('uploaded'); expect(rep.feeds.length).toBeGreaterThan(0);
  });
});
