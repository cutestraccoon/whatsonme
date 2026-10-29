import { describe, it, expect } from 'vitest';
import { tiktok, detectSources } from '../src/parsers/index.js';
import { MapArchive } from '../src/util/archive.js';
const enc = new TextEncoder();
const d = (i: number, h: number) => `2026-0${1 + (i % 3)}-${String(1 + (i % 27)).padStart(2, '0')} ${String(h).padStart(2, '0')}:1${i % 10}:00`;
describe('tiktok txt export', () => {
  it('detects and parses the TXT folder layout', async () => {
    const a = new MapArchive({
      'Activity/Video Browsing History.txt': enc.encode(Array.from({ length: 80 }, (_, i) => `Date: ${d(i, 23)}\nLink: https://www.tiktokv.com/share/video/70000${i}/\n`).join('\n')),
      'Activity/Like List.txt': enc.encode(Array.from({ length: 12 }, (_, i) => `Date: ${d(i, 22)}\nLink: https://www.tiktokv.com/share/video/80000${i}/\n`).join('\n')),
      'Activity/Search History.txt': enc.encode(['condo tour', 'cs2 config', 'espresso'].map((q, i) => `Date: ${d(i, 12)}\nSearch Term: ${q}\n`).join('\n')),
      'Activity/Login History.txt': enc.encode(Array.from({ length: 5 }, (_, i) => `Date: ${d(i, 8)}\nIP: 99.230.1.${i}\nDeviceModel: iPhone15,2\nDeviceSystem: iOS 18.1\nNetworkType: Wi-Fi\nCarrier: Rogers\n`).join('\n')),
      'Comments/Comments.txt': enc.encode(`Date: ${d(1, 20)}\nComment: nice\n\nDate: ${d(2, 21)}\nComment: lol\n`),
      'Direct Messages/Chat History.txt': enc.encode(`>>> Chat History with sam:\nDate: ${d(1, 23)}\nFrom: sam\nContent: hey\n\nDate: ${d(1, 23)}\nFrom: casey\nContent: yo\n\n>>> Chat History with alex:\nDate: ${d(2, 1)}\nFrom: alex\nContent: ?\n`),
      'Ads and data/Ad Interests.txt': enc.encode('Interest Categories: Technology & Electronics, Finance & Investing, Gaming\n'),
      'Ads and data/Off TikTok Activity.txt': enc.encode(Array.from({ length: 4 }, (_, i) => `TimeStamp: ${d(i, 20)}\nSource: Food Delivery App\nEvent: Purchase\n`).join('\n')),
      'Profile/Profile Information.txt': enc.encode('Username: casey\nBirthdate: 1996-04-12\nEmail Address: casey@example.com\n'),
      'App Settings/Settings.txt': enc.encode('Device Model: iPhone15,2\nCountry Region: CA\nLanguage: en\n'),
    });
    expect(detectSources(a).map((p) => p.source)).toEqual(['tiktok']);
    const r = await tiktok.parse(a); const k: Record<string, number> = {}; for (const e of r.events) k[e.kind] = (k[e.kind] ?? 0) + 1;
    expect(k.watch).toBe(80); expect(k.like).toBe(12); expect(k.search).toBe(3); expect(k.login).toBe(5); expect(k.comment).toBe(2); expect(k.message).toBe(3); expect(k.off_platform).toBe(4);
    expect(r.events.find((e) => e.kind === 'message' && e.actor === 'alex')?.title).toBe('alex');
    expect(r.claims.filter((c) => c.field === 'ad_interest').length).toBe(3); expect(r.claims.find((c) => c.field === 'carrier')?.value).toBe('Rogers');
    expect(r.claims.find((c) => c.field === 'declared_email_address')?.value).not.toContain('casey@example'); expect(r.events.find((e) => e.kind === 'login')?.meta?.ip).toBe('99.230.•.•');
    expect(r.warnings.some((w) => /TXT export/.test(w))).toBe(true);
  });
});
