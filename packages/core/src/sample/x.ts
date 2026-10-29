import type { MapArchive } from '../util/archive.js';
import { INTERESTS, archive, iso, json, randomTs, rng, sqlTs } from './_rng.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Twitter's "Wed Oct 10 20:19:24 +0000 2018" */
function twDate(ms: number): string { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`; }
const ytd = (name: string, arr: unknown[]) => `window.YTD.${name}.part0 = ${JSON.stringify(arr, null, 2)}`;

const ADVERTISERS = ['Wealthsimple', 'Tesla', 'Shopify', 'Air Canada', 'Uber Eats', 'Rogers', 'Bell Canada', 'Coinbase', 'Notion', 'DoorDash'];

/** Twitter/X archive: data/*.js files with the window.YTD prefix. */
export function makeXArchive(): MapArchive {
  const r = rng(7);
  const tweets = Array.from({ length: 70 }, (_, i) => ({ tweet: {
    id_str: String(1700000000000000000 + i), created_at: twDate(randomTs(r)), full_text: r.chance(0.2) ? 'RT @someone: interesting thread about ' + r.pick(INTERESTS) : 'thoughts on ' + r.pick(INTERESTS).toLowerCase() + ' today',
    favorite_count: String(r.int(0, 40)), retweet_count: String(r.int(0, 5)), source: '<a href="http://twitter.com/download/iphone" rel="nofollow">Twitter for iPhone</a>', lang: 'en',
    ...(r.chance(0.3) ? { in_reply_to_status_id_str: '1690000000000000000' } : {}), entities: { hashtags: [], user_mentions: [], urls: [] },
  } }));
  const likes = Array.from({ length: 150 }, (_, i) => ({ like: { tweetId: String(1600000000000000000 + i), fullText: 'liked tweet #' + i, expandedUrl: 'https://twitter.com/i/web/status/' + (1600000000000000000 + i) } }));
  const dms = Array.from({ length: 4 }, (_, c) => ({ dmConversation: { conversationId: `1234-${5678 + c}`, messages: Array.from({ length: r.int(10, 25) }, () => ({ messageCreate: {
    recipientId: r.chance(0.5) ? '1234' : String(5678 + c), senderId: r.chance(0.5) ? '1234' : String(5678 + c), text: 'hey, are we still on for ' + r.pick(['saturday', 'the show', 'dinner']) + '?', mediaUrls: [], reactions: [], urls: [], createdAt: iso(randomTs(r)),
  } })) } }));
  const imp = (): any => ({ deviceInfo: { osType: 'iOS', deviceId: 'abc', deviceType: 'iPhone' }, displayLocation: r.pick(['TimelineHome', 'ProfileTweets', 'SearchTweets']), promotedTweetInfo: { tweetId: '1', tweetText: 'Promoted: ' + r.pick(INTERESTS), urls: [], mediaUrls: [] },
    advertiserInfo: { advertiserName: r.pick(ADVERTISERS), screenName: '@adv' }, publisherInfo: { publisherName: 'Twitter', screenName: '@twitter' },
    matchedTargetingCriteria: [{ targetingType: 'Locations', targetingValue: 'Toronto, Ontario, Canada' }, { targetingType: 'Age', targetingValue: '25 to 34' }, { targetingType: 'Interests', targetingValue: r.pick(INTERESTS) }].filter(() => r.chance(0.8)), impressionTime: sqlTs(randomTs(r)) });
  const impressions = Array.from({ length: 90 }, imp);
  const engagements = Array.from({ length: 12 }, () => { const i = imp(); return { impressionAttributes: i, engagementAttributes: [{ engagementTime: sqlTs(Date.parse(i.impressionTime + 'Z') + r.int(1000, 60000)), engagementType: r.pick(['ChargeableImpression', 'Click', 'Detail', 'URLClick']) }] }; });
  return archive({
    'Your archive.html': '<html></html>',
    'data/README.txt': 'This archive contains your data',
    'data/manifest.js': 'window.__THAR_CONFIG = {}',
    'data/account.js': ytd('account', [{ account: { email: 'ferris@example.com', createdVia: 'web', username: 'ferriswheel', accountId: '1234', createdAt: '2012-03-14T18:22:10.000Z', accountDisplayName: 'Ferris' } }]),
    'data/tweets.js': ytd('tweets', tweets),
    'data/like.js': ytd('like', likes),
    'data/direct-messages.js': ytd('direct_messages', dms),
    'data/ad-impressions.js': ytd('ad_impressions', [{ ad: { adsUserData: { adImpressions: { impressions } } } }]),
    'data/ad-engagements.js': ytd('ad_engagements', [{ ad: { adsUserData: { adEngagements: { engagements } } } }]),
    'data/ip-audit.js': ytd('ip_audit', Array.from({ length: 30 }, () => ({ ipAudit: { accountId: '1234', createdAt: iso(randomTs(r)), loginIp: `99.2${r.int(10, 55)}.${r.int(0, 255)}.${r.int(0, 255)}` } }))),
    'data/personalization.js': ytd('personalization', [{ p13nData: {
      demographics: { languages: [{ language: 'English', isDisabled: false }, { language: 'Arabic', isDisabled: false }], genderInfo: { gender: 'male' } },
      interests: { interests: INTERESTS.map((n) => ({ name: n, isDisabled: r.chance(0.1) })), partnerInterests: [], audienceAndAdvertisers: { numAudiences: '48', advertisers: ADVERTISERS, lookalikeAdvertisers: ADVERTISERS.slice(0, 4) }, shows: ['Succession', 'The Bear'] },
      locationHistory: ['Toronto, Ontario', 'London, Ontario'], inferredAgeInfo: { age: ['25-34'], birthDate: '' },
    } }]),
  });
}
