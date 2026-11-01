import { MapArchive } from '../util/archive.js';

const enc = new TextEncoder();
const J = (o: unknown) => enc.encode(JSON.stringify(o));
// deterministic PRNG
let seed = 42; export const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
export const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000;
export const START = Date.UTC(2026, 0, 5); // Mon Jan 5 2026
/** timestamp in a given local hour (Toronto ~ UTC-4/5; we just use UTC-4 for fixtures) */
export const at = (dayOffset: number, hourLocal: number, min = Math.floor(rnd() * 60)) => START + dayOffset * DAY + ((hourLocal + 4) % 24) * 3600000 + min * 60000;
const nightHour = () => pick([22, 23, 23, 0, 0, 1, 12, 13, 18, 19, 20, 21]);

const IG_TITLES = ['Toronto condo tour 2026 👀', 'Tesla Model 3 vs Hyundai Ioniq 6', 'how i built a $10k/mo saas', 'arabic r&b remix 🎧', 'CS2 ace clutch', 'Rolex Submariner unboxing', 'best espresso grinder under $500', 'housing market crash incoming??', 'try not to laugh 😂', 'mortgage pre-approval explained'];

// Invented handles with a realistic, uneven spread (a few accounts dominate the feed).
const CREATOR_POOL = ['condo.tours.to', 'condo.tours.to', 'condo.tours.to', 'condo.tours.to', 'condo.tours.to', 'garagejournal', 'garagejournal', 'garagejournal', 'garagejournal', 'espresso.nerd', 'espresso.nerd', 'espresso.nerd', 'daily.watchdrop', 'daily.watchdrop', 'ace.clutch.clips', 'ace.clutch.clips', 'moneywithmaya', 'moneywithmaya', 'shawarma.diaries', 'late.night.beats', 'the.build.log', 'kayla.moves'];
const BRAND_POOL = ['Uber Eats', 'Uber Eats', 'Uber Eats', 'Wealthsimple', 'Wealthsimple', 'Nike', 'Shopify', 'Audible'];
const creatorAt = (i: number) => CREATOR_POOL[(i * 7 + (i >> 2)) % CREATOR_POOL.length]!;
const brandAt = (i: number) => BRAND_POOL[(i * 5 + (i >> 1)) % BRAND_POOL.length]!;
const YT = [['Why Toronto Condos Are Crashing (Explained)', 'The Plain Bagel'], ['I Built an AI Agent in Python', 'Fireship'], ['CS2 Pro Highlights', 'ESL'], ['Berkshire 2026 Annual Meeting Full', 'CNBC'], ['Pre-construction condo tour Yonge & Sheppard', 'Toronto Condo Life'], ['Layoffs are coming: the recession no one sees', 'Economics Explained'], ['Best espresso machine 2026', 'James Hoffmann'], ['Rolex vs Omega: which to buy', 'Teddy Baldassarre'], ['How Palantir works', 'Fern'], ['Arabic R&B official video', 'VEVO']];
const SEARCHES = ['condo maintenance fees north york', 'ollama rtx 3070 best model', 'mortgage calculator ontario', 'is the condo market crashing', 'cs2 movement config', 'espresso grinder deal', 'tesla lease canada', 'pre-construction toronto 2026', 'how to start a business ontario', 'rolex submariner price'];

export function makeInstagramArchive() {
  const files: Record<string, Uint8Array> = {};
  const impressions: any[] = []; const likes: any[] = []; const saved: any[] = []; const ads: any[] = []; const posts: any[] = [];
  for (let d = 0; d < 120; d++) {
    const n = 5 + Math.floor(rnd() * 25);
    for (let i = 0; i < n; i++) { const t = Math.floor(at(d, nightHour()) / 1000); const title = pick(IG_TITLES); impressions.push({ string_map_data: { Author: { value: creatorAt(i) }, Title: { value: title }, Time: { timestamp: t } } });
      if (rnd() < 0.2) likes.push({ title: creatorAt(i), string_list_data: [{ href: 'https://www.instagram.com/p/abc' + i, value: 'â\u009d¤ï¸\u008f', timestamp: t + 30 }] });
      if (rnd() < 0.05) saved.push({ title: creatorAt(i), string_map_data: { 'Saved on': { href: 'https://www.instagram.com/p/s' + i, timestamp: t + 40 } } });
      if (rnd() < 0.15) ads.push({ string_map_data: { Author: { value: brandAt(i) }, Time: { timestamp: t + 10 } } }); }
    if (d % 20 === 0) posts.push({ media: [{ uri: 'media/posts/x.jpg', creation_timestamp: Math.floor(at(d, 18) / 1000), title: 'weekend' }], title: 'weekend' });
  }
  files['your_instagram_activity/likes/liked_posts.json'] = J({ likes_media_likes: likes });
  files['your_instagram_activity/saved/saved_posts.json'] = J({ saved_saved_media: saved });
  files['ads_information/ads_and_topics/videos_watched.json'] = J({ impressions_history_videos_watched: impressions });
  files['ads_information/ads_and_topics/ads_viewed.json'] = J({ impressions_history_ads_seen: ads });
  files['your_instagram_activity/content/posts_1.json'] = J(posts);
  files['logged_information/recent_searches/word_or_phrase_searches.json'] = J({ searches_keyword: SEARCHES.map((s, i) => ({ string_map_data: { Search: { value: s }, Time: { timestamp: Math.floor(at(i * 9, 12) / 1000) } } })) });
  files['preferences/your_topics/your_topics.json'] = J({ topics_your_topics: ['Real Estate', 'Electric Vehicles', 'Small Business Owners', 'Luxury Watches', 'Golf', 'Arabic Music'].map((n) => ({ string_map_data: { Name: { value: n } } })) });
  files['ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.json'] = J({ ig_custom_audiences_all_types: [
    { advertiser_name: 'Rogers', has_data_file_custom_audience: true, has_remarketing_custom_audience: false, has_in_person_store_visit: false },
    { advertiser_name: 'Condo Developer Inc', has_data_file_custom_audience: true, has_remarketing_custom_audience: true, has_in_person_store_visit: false },
    { advertiser_name: 'Hinge', has_data_file_custom_audience: true, has_remarketing_custom_audience: false, has_in_person_store_visit: false },
    ...Array.from({ length: 28 }, (_, i) => ({ advertiser_name: 'Shop ' + i, has_data_file_custom_audience: false, has_remarketing_custom_audience: true, has_in_person_store_visit: false })) ] });
  files['apps_and_websites_off_of_instagram/apps_and_websites/your_activity_off_meta_technology.json'] = J({ apps_and_websites_off_meta_activity: [
    { name: 'Shopping App', events: Array.from({ length: 80 }, (_, i) => ({ type: pick(['PAGE_VIEW', 'VIEW_CONTENT', 'ADD_TO_CART']), timestamp: Math.floor(at(i, 21) / 1000) })) },
    { name: 'Bank App', events: Array.from({ length: 40 }, (_, i) => ({ type: 'ACTIVATE_APP', timestamp: Math.floor(at(i * 2, 8) / 1000) })) },
    { name: 'Condo Listings', events: Array.from({ length: 30 }, (_, i) => ({ type: 'PAGE_VIEW', timestamp: Math.floor(at(60 + i, 22) / 1000) })) } ] });
  files['personal_information/information_about_you/profile_based_in.json'] = J({ inferred_data_primary_location: [{ string_map_data: { 'City Name': { value: 'Toronto, Ontario' } } }] });
  files['personal_information/personal_information/personal_information.json'] = J({ profile_user: [{ string_map_data: { Username: { value: 'alex' }, Gender: { value: 'Male' }, Email: { value: 'alex@example.com' } } }] });
  files['security_and_login_information/login_and_profile/login_activity.json'] = J({ account_history_login_history: Array.from({ length: 30 }, (_, i) => ({ string_map_data: { 'IP Address': { value: `99.230.1.${i % 6}` }, Time: { timestamp: Math.floor(at(i * 4, 9) / 1000) }, 'User Agent': { value: 'Instagram 300.0 (iPhone15,2; iOS 18)' } } })) });
  files['media/posts/x.jpg'] = new Uint8Array([0xff, 0xd8]);
  return new MapArchive(files);
}

export function makeTikTokArchive() {
  const VideoList: any[] = []; const ItemFavoriteList: any[] = []; const SearchList: any[] = [];
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  for (let d = 0; d < 120; d++) { const n = 10 + Math.floor(rnd() * 60); for (let i = 0; i < n; i++) { const t = at(d, pick([23, 23, 0, 0, 1, 13, 20, 22])); VideoList.push({ Date: fmt(t), Link: 'https://www.tiktokv.com/share/video/' + (7000000000 + d * 1000 + i) + '/' }); if (rnd() < 0.04) ItemFavoriteList.push({ Date: fmt(t + 5000), Link: 'https://www.tiktokv.com/share/video/' + (7000000000 + d * 1000 + i) + '/' }); } if (d % 6 === 0) SearchList.push({ Date: fmt(at(d, 22)), SearchTerm: pick(SEARCHES) }); }
  const j = { 'Your Activity': { 'Watch History': { VideoList }, 'Like List': { ItemFavoriteList }, 'Search History': { SearchList },
      'Login History': { LoginHistoryList: Array.from({ length: 25 }, (_, i) => ({ Date: fmt(at(i * 5, 8)), IP: `99.230.1.${i % 9}`, DeviceModel: 'iPhone15,2', DeviceSystem: 'iOS 18.1', NetworkType: 'Wi-Fi', Carrier: 'Rogers' })) } },
    'Ads and data': { 'Ad Interests': { AdInterestCategories: ['Technology & Electronics', 'Finance & Investing', 'Real Estate', 'Luxury & Watches', 'Gaming'] }, 'Off TikTok Activity': { OffTikTokActivityDataList: Array.from({ length: 20 }, (_, i) => ({ TimeStamp: fmt(at(i * 3, 20)), Source: 'Food Delivery App', Event: 'Purchase' })) } },
    Profile: { 'Profile Information': { ProfileMap: { userName: 'alex', birthDate: '1996-04-12', emailAddress: 'alex@example.com' } } },
    'App Settings': { Settings: { SettingsMap: { 'Device Model': 'iPhone15,2', 'Country Region': 'CA', Language: 'en' } } },
    'Direct Messages': { 'Chat History': { ChatHistory: { 'Chat History with sam:': Array.from({ length: 40 }, (_, i) => ({ Date: fmt(at(i * 2, 23)), From: i % 2 ? 'sam' : 'alex', Content: 'hey' })) } } } };
  return new MapArchive({ 'user_data_tiktok.json': J(j) });
}

export function makeGoogleArchive() {
  const files: Record<string, Uint8Array> = {};
  const iso = (ms: number) => new Date(ms).toISOString();
  const search = Array.from({ length: 400 }, (_, i) => ({ header: 'Search', title: 'Searched for ' + pick(SEARCHES), time: iso(at(i % 120, pick([8, 12, 13, 19, 22, 23]))), products: ['Search'] }));
  files['takeout/my activity/search/myactivity.json'] = J(search);
  const yt = Array.from({ length: 900 }, (_, i) => { const [t, ch] = pick(YT); return { header: 'YouTube', title: 'Watched ' + t, titleUrl: 'https://www.youtube.com/watch?v=' + i, subtitles: [{ name: ch, url: 'https://www.youtube.com/channel/x' }], time: iso(at(i % 120, pick([20, 21, 22, 23, 23, 0, 9, 10]))), products: ['YouTube'] }; });
  files['takeout/youtube and youtube music/history/watch-history.json'] = J(yt);
  files['takeout/my activity/ads/myactivity.json'] = J(Array.from({ length: 60 }, (_, i) => ({ header: 'Ads', title: 'Viewed ad for Condo Developer Inc', time: iso(at(i * 2, 21)), details: [{ name: 'From Google Ads' }], products: ['Ads'] })));
  // Semantic location history: home nights, work weekdays, london ON every 3rd weekend
  const HOME = [43.7755, -79.3461], WORK = [43.8475, -79.3700], LONDON = [42.9849, -81.2453];
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL'];
  months.forEach((mo, mi) => { const objs: any[] = []; for (let d = 0; d < 30; d++) { const day = mi * 30 + d; const dow = (day + 0) % 7; const london = dow >= 5 && Math.floor(day / 7) % 3 === 0;
      const visit = (ll: number[], sh: number, eh: number, type: string, name: string) => objs.push({ placeVisit: { location: { latitudeE7: Math.round(ll[0] * 1e7), longitudeE7: Math.round(ll[1] * 1e7), name, semanticType: type, locationConfidence: 92 }, duration: { startTimestamp: iso(at(day, sh, 0)), endTimestamp: iso(at(day, eh, 0)) }, placeConfidence: 'HIGH_CONFIDENCE' } });
      const seg = (from: number[], sh: number, mins: number) => objs.push({ activitySegment: { startLocation: { latitudeE7: Math.round(from[0] * 1e7), longitudeE7: Math.round(from[1] * 1e7) }, duration: { startTimestamp: iso(at(day, sh, 0)), endTimestamp: iso(at(day, sh, mins)) }, distance: 24000, activityType: 'IN_PASSENGER_VEHICLE', confidence: 'HIGH', activities: [{ activityType: 'IN_PASSENGER_VEHICLE', probability: 91.2 }, { activityType: 'IN_BUS', probability: 5.1 }] } });
      if (london) { visit(LONDON, 10, 22, 'TYPE_UNKNOWN', 'Farm'); continue; }
      visit(HOME, 0, 7, 'TYPE_HOME', 'Home'); if (dow < 5) { seg(HOME, 7, 25); visit(WORK, 8, 17, 'TYPE_WORK', 'Work'); seg(WORK, 17, 28); } visit(HOME, 18, 23, 'TYPE_HOME', 'Home'); }
    files[`takeout/location history (timeline)/semantic location history/2026/2026_${mo}.json`] = J({ timelineObjects: objs }); });
  files['takeout/access log activity/activities - a list of google services accessed by.csv'] = enc.encode('Activity Timestamp,Product Name,Activity Type,IP Address,User Agent String\n' + Array.from({ length: 50 }, (_, i) => `${iso(at(i * 2, 9))},Gmail,Login,99.230.1.${i % 7},Mozilla/5.0`).join('\n'));
  files['takeout/google play store/installs.json'] = J(Array.from({ length: 30 }, (_, i) => ({ install: { doc: { title: 'App ' + i }, firstInstallationTime: iso(at(-i * 40, 12)), deviceAttribute: { model: 'Pixel 8' } } })));
  files['takeout/chrome/browserhistory.json'] = J({ 'Browser History': Array.from({ length: 300 }, (_, i) => ({ title: pick(['realtor.ca - Condos for sale', 'GitHub', 'Ollama models', 'YouTube', 'Rolex Canada', 'QuickBooks Online']), url: 'https://example.com/' + i, time_usec: at(i % 120, pick([9, 12, 15, 21, 23])) * 1000 })) });
  return new MapArchive(files);
}

export function makeAppleArchive() {
  const files: Record<string, Uint8Array> = {};
  const rows = ['Song Name,Artist Name,Event Start Timestamp,Play Duration Milliseconds,End Reason Type,Device Type'];
  for (let i = 0; i < 500; i++) rows.push(`"${pick(['Habibi (Remix)', 'Late Nights', 'Lo-fi Study', 'Tarab Classics', 'Drive'])}","Artist ${i % 9}",${new Date(at(i % 120, pick([7, 8, 17, 18, 22, 23]))).toISOString()},${120000 + Math.floor(rnd() * 180000)},${pick(['NATURAL_END_OF_TRACK', 'NATURAL_END_OF_TRACK', 'MANUALLY_SELECTED_PLAYBACK_OF_A_DIFF_ITEM', 'SCRUB_END'])},iPhone`);
  files['apple media services information/apple music play activity/apple music play activity.csv'] = enc.encode(rows.join('\n'));
  files['apple media services information/app store/app store click activity.csv'] = enc.encode('Event Date Time,Event Type,Search Query,App Name\n' + Array.from({ length: 40 }, (_, i) => `${new Date(at(i * 3, 20)).toISOString()},search,${pick(['mortgage calculator', 'ollama', 'cs2 stats', 'espresso timer'])},`).join('\n'));
  files['apple media services information/stores activity/account and transaction history/store transaction history.csv'] = enc.encode('Order ID,Purchase Date,Item Description,Billed Amount,Currency\n' + [['Procreate', '12.99'], ['Ulysses', '6.99'], ['Notability', '14.99'], ['Minecraft', '9.99'], ['Day One', '4.99']].map(([n, a], i) => `M${i}1,${new Date(at(10 + i * 21, 15)).toISOString()},${n},${a},CAD`).join('\n'));
  files['apple media services information/stores activity/account and transaction history/subscription history.csv'] = enc.encode('Subscription Name,Start Date,Price\nApple Music Individual,2024-05-01,10.99\niCloud+ 200 GB,2023-02-14,3.99\nApple TV+,2025-09-12,12.99');
  files['apple media services information/stores activity/account and transaction history/app authorization history.csv'] = enc.encode('App Name,Date\nUber,2025-06-01T12:00:00Z\nSpotify,2024-11-20T18:00:00Z\nStrava,2025-03-08T09:00:00Z');
  files['apple id account and device information/apple id sign-in activity.csv'] = enc.encode('Date and Time,IP Address,Device\n' + Array.from({ length: 12 }, (_, i) => `${new Date(at(i * 9, 8)).toISOString()},203.0.113.${i + 5},${pick(['iPhone 15 Pro', 'MacBook Pro', 'iPad Air', 'Safari on Windows'])}`).join('\n'));
  files['apple id account and device information/apple id account information.csv'] = enc.encode('Apple ID,Birthday,Country/Region,Account Creation Date\nalex@example.com,1996-04-12,Canada,2012-03-01');
  let xml = '<?xml version="1.0"?><HealthData locale="en_CA">';
  for (let d = 0; d < 120; d++) { const day = new Date(at(d, 12)).toISOString().slice(0, 10); for (let k = 0; k < 12; k++) xml += `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="${day} ${String(7 + k).padStart(2, '0')}:00:00 -0400" endDate="${day} ${String(7 + k).padStart(2, '0')}:59:00 -0400" value="${Math.floor(300 + rnd() * 900)}"/>`;
    xml += `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="${day} 00:40:00 -0400" endDate="${day} 07:10:00 -0400" value="HKCategoryValueSleepAnalysisAsleepCore"/>`;
    if (d % 3 === 0) xml += `<Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="52" durationUnit="min" startDate="${day} 18:30:00 -0400" endDate="${day} 19:22:00 -0400" sourceName="Watch"></Workout>`; }
  xml += '</HealthData>';
  files['apple_health_export/export.xml'] = enc.encode(xml);
  return new MapArchive(files);
}
