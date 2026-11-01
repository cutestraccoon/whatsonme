import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { ZipArchive } from '../src/util/archive.js';
import { apple } from '../src/parsers/apple.js';
import { detectSources, parseAll } from '../src/parsers/index.js';
import { checkEvents, checkClaims, expectMasked } from './_helpers.js';

const z = (o: Record<string, string | Uint8Array>) => zipSync(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
const csv = (head: string[], rows: string[][]) => [head.join(','), ...rows.map((r) => r.map((c) => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))].join('\n');

/** Shaped like a real privacy.apple.com delivery: several zips, some nested, plus a Health export. */
function makeAppleDelivery() {
  const media = z({
    'Apple Media Services/Apple Music Activity/Apple Music Play Activity.csv': csv(['Event Start Timestamp', 'Song Name', 'Artist Name', 'Play Duration Milliseconds', 'End Reason Type'],
      [['2026-03-02T22:10:00Z', 'Midnight City', 'M83', '241000', 'NATURAL_END_OF_TRACK'], ['2026-03-02T22:15:00Z', 'Intro', 'The xx', '30000', 'MANUAL_SKIP']]),
    'Apple Media Services/Apple Music Activity/Apple Music - Play History Daily Tracks.csv': csv(['Country', 'Track Identifier', 'Date Played', 'Hours', 'Track Description', 'Play Duration Milliseconds'],
      [['CA', '1', '20260310', '23,0', 'Tame Impala - The Less I Know The Better', '216000']]),
    'Apple Media Services/Apple Music Activity/Apple Music Likes and Dislikes.csv': csv(['Item Description', 'Preference', 'Date Added'], [['Daft Punk - Veridis Quest', 'LIKE', '2026-01-04T10:00:00Z'], ['Some Song', 'DISLIKE', '2026-01-05T10:00:00Z']]),
    'Apple Media Services/Stores Activity/Account and Transaction History/Store Transaction History.csv': csv(['Order ID', 'Purchase Date', 'Item Description', 'Billed Amount', 'Currency'], [['A1', '2026-02-14T15:00:00Z', 'Procreate', '$12.99', 'CAD']]),
    'Apple Media Services/Stores Activity/Account and Transaction History/Subscription History.csv': csv(['Subscription Name', 'Start Date', 'Price'], [['Apple Music Individual', '2024-05-01', '10.99']]),
    'Apple Media Services/Stores Activity/Account and Transaction History/App Authorization History.csv': csv(['App Name', 'Date'], [['Uber', '2025-06-01T12:00:00Z']]),
    'Apple Media Services/Stores Activity/Apple TV and Podcast Information/Podcasts Playstate.csv': csv(['Show Title', 'Episode Title', 'Last Played Date'], [['Acquired', 'NVIDIA', '2026-02-20T09:00:00Z']]),
    'Apple Media Services/App Store/App Store Click Activity.csv': csv(['Event Date Time', 'Event Type', 'Search Query'], [['2026-02-14T14:55:00Z', 'search', 'photo editor']]),
  });
  const store = z({ 'Apple.com and Apple Store/Transaction History/Online Purchase History.csv': csv(['Order Date', 'Item Description', 'Price'], [['2025-11-28', 'AirPods Pro', '329.00']]),
    'Apple.com and Apple Store/Transaction History/Retail Store Receipts.zip': z({ 'receipt.csv': csv(['Purchase Date', 'Item Description', 'Amount'], [['2025-12-01', 'Case', '49.00']]) }) });
  const care = z({ 'AppleCare/AppleCare Cases.csv': csv(['Case Created Date', 'Issue'], [['2025-09-09', 'Battery service']]) });
  const other = z({ 'Maps/Maps_Location_Attributes.json': JSON.stringify({ places: [{ name: 'Home', latitude: 43.7, longitude: -79.4, timestamp: '2026-01-02T10:00:00Z' }, { latitude: 43.8, longitude: -79.3 }] }),
    'Wi-Fi/KnownNetworks.xml': '<plist><dict><key>SSID_STR</key><string>CafeWifi</string><key>SSID_STR</key><string>HomeNet</string></dict></plist>' });
  const photos = z({ 'iCloud Photos/Photos Part 1.zip': new Uint8Array(1000) });
  return z({
    'Apple_Media_Services.zip': media, 'Apple.com and Apple Store.zip': store, 'AppleCare.zip': care, 'Other Data Part 2 of 3.zip': other, 'iCloud Photos Part 1 of 1.zip': photos,
    'Apple ID Account and Device Information/Apple ID Account Information.csv': csv(['Apple ID', 'Birthday', 'Country/Region', 'Account Creation Date'], [['someone@example.com', '1995-06-02', 'Canada', '2012-03-01']]),
    'Apple ID Account and Device Information/Apple ID Sign-In Activity.csv': csv(['Date and Time', 'IP Address', 'Device'], [['2026-03-01T08:00:00Z', '99.230.1.5', 'iPhone 15 Pro']]),
    'Apple ID Account and Device Information/Devices.csv': csv(['Device Name', 'Model'], [['My iPhone', 'iPhone 15 Pro']]),
    'Apple ID Account and Device Information/Hide My Email Information.csv': csv(['Alias'], [['a@icloud.com'], ['b@icloud.com']]),
    'apple_health_export/export.xml': '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-03-03 08:00:00 -0500" endDate="2026-03-03 08:10:00 -0500" value="500" sourceName="iPhone"/></HealthData>',
    'apple_health_export/workout-routes/route_2026-03-03.gpx': '<gpx><trk><trkseg>' + Array.from({ length: 45 }, (_, i) => `<trkpt lat="43.7${i}" lon="-79.4${i}"><ele>100</ele><time>2026-03-03T13:${String(i).padStart(2, '0')}:00Z</time></trkpt>`).join('') + '</trkseg></trk></gpx>',
    'apple_health_export/electrocardiograms/ecg_2026-03-03.csv': 'Name,Bob\nData,1',
  });
}

describe('Apple: full privacy.apple.com delivery', () => {
  const zip = makeAppleDelivery();
  const arc = new ZipArchive(zip);
  it('opens nested zips and skips photo archives', () => {
    const l = arc.list();
    expect(l.some((p) => /apple music play activity\.csv$/.test(p))).toBe(true);
    expect(l.some((p) => /receipt\.csv$/.test(p))).toBe(true);
    expect(l.some((p) => p.endsWith('.zip'))).toBe(false);
    expect(l.some((p) => /icloud photos/.test(p))).toBe(false);
  });
  it('detects Apple and nothing else', () => { expect(detectSources(arc).map((p) => p.source)).toEqual(['apple']); });
  it('parses every area', async () => {
    const res = await apple.parse(arc);
    checkEvents(res.events.filter((e) => e.source === 'apple'), 'apple'); checkClaims(res.claims, 'apple'); expectMasked(res);
    const k = (kind: string, pred: (e: any) => boolean = () => true) => res.events.filter((e) => e.kind === kind && pred(e));
    expect(k('play').length).toBeGreaterThanOrEqual(5);                       // 2 activity + 2 daily hours + 1 podcast
    expect(k('play', (e) => e.title === 'The Less I Know The Better' && e.actor === 'Tame Impala').length).toBe(2); // two listed hours
    expect(k('play', (e) => e.meta?.skipped).length).toBe(1);
    expect(k('like').length).toBe(2); expect(k('like', (e) => e.meta?.disliked).length).toBe(1);
    expect(k('purchase').map((e) => e.title)).toEqual(expect.arrayContaining(['Procreate', 'AirPods Pro', 'Case', 'Subscription: Apple Music Individual']));
    expect(k('purchase', (e) => e.title === 'Procreate')[0].value).toBe(12.99);
    expect(k('login').length).toBe(2); expect(k('login', (e) => e.meta?.via === 'apple-id')[0].meta?.ip).toBe('99.230.•.•');
    expect(k('search').length + k('visit').length).toBeGreaterThan(0);
    expect(k('other', (e) => /AppleCare/.test(e.title ?? '')).length).toBe(1);
    expect(k('location', (e) => e.meta?.via === 'apple-maps').length).toBe(1);            // undated point is not given a fake date
    expect(k('location', (e) => e.meta?.via === 'health-gpx').length).toBe(3);            // every 20th of 45 points
    const f = (field: string) => res.claims.filter((c) => c.field === field);
    expect(f('declared_birth_year')[0].value).toBe('1995'); expect(f('profile_based_in')[0].value).toBe('Canada');
    expect(f('declared_email_address')[0].value).not.toContain('someone');
    expect(f('subscription')[0].value).toBe('Apple Music Individual'); expect(f('sign_in_with_apple')[0].value).toBe('Uber');
    expect(f('hide_my_email_aliases')[0].value).toBe('2'); expect(f('known_wifi_networks')[0].value).toMatch(/2 Wi-Fi networks/);
    expect(f('apple_maps_places')[0].value).toMatch(/2 places/); expect(f('ecg_recordings')[0].value).toBe('1'); expect(f('device').length).toBeGreaterThan(0);
    for (const fl of res.files) expect(arc.list()).toContain(fl);
  });
  it('end to end through parseAll', async () => { const r = await parseAll(arc); expect(r.map((x) => x.source)).toEqual(['apple']); expect(r[0].warnings).toEqual([]); });
});
