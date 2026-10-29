import type { Archive, Claim, Event, Parser, ParseResult } from '../types.js';
import { byName, safeJson, toMs } from '../util/text.js';

/**
 * Twitter / X archive. Everything lives in data/*.js as `window.YTD.<name>.part0 = [ ... ]`;
 * strip the prefix and JSON.parse. Larger accounts split into part0, part1, ...
 */
export const x: Parser = {
  source: 'x',
  detect: (paths) => paths.some((p) => /(^|\/)data\/(tweets?|like|account|personalization|direct-messages|ad-impressions|ad-engagements|ip-audit)(-part\d+)?\.js$/.test(p)),
  async parse(a: Archive, onProgress) {
    const paths = a.list();
    const events: Event[] = []; const claims: Claim[] = []; const files: string[] = []; const warnings: string[] = [];
    const read = async (p: string): Promise<any[]> => { files.push(p); return ytd(await a.text(p)); };
    const want = (name: string) => byName(paths, new RegExp(`(^|/)data/${name}(-part\\d+)?\\.js$`));

    // tweets
    for (const p of want('tweets?')) {
      for (const it of await read(p)) {
        const tw = it?.tweet ?? it; const t = toMs(tw?.created_at); if (!t) continue;
        const text = String(tw.full_text ?? tw.text ?? '');
        events.push({ ts: t, source: 'x', kind: 'post', value: text.length, file: p,
          meta: { reply: !!tw.in_reply_to_status_id_str || !!tw.in_reply_to_status_id, retweet: /^RT @/.test(text), favorites: Number(tw.favorite_count) || 0, retweets: Number(tw.retweet_count) || 0, source: stripTags(String(tw.source ?? '')), lang: tw.lang ?? '' } });
      }
    }
    // likes (no timestamps in the export; keep the count)
    for (const p of want('like')) {
      const arr = await read(p); let n = 0;
      for (const it of arr) { const l = it?.like ?? it; if (!l) continue; n++; const t = toMs(l.created_at ?? l.createdAt); if (t) events.push({ ts: t, source: 'x', kind: 'like', url: l.expandedUrl, file: p }); }
      claims.push({ source: 'x', field: 'likes_count', value: String(n), file: p });
    }
    // direct messages
    for (const p of [...want('direct-messages'), ...want('direct-messages-group')]) {
      for (const it of await read(p)) {
        const conv = it?.dmConversation ?? it; const cid = String(conv?.conversationId ?? '');
        for (const m of conv?.messages ?? []) {
          const mc = m?.messageCreate ?? m; const t = toMs(mc?.createdAt); if (!t) continue;
          events.push({ ts: t, source: 'x', kind: 'message', actor: String(mc.senderId ?? ''), title: cid, value: String(mc.text ?? '').length, file: p, meta: { group: /group/.test(p), media: Array.isArray(mc.mediaUrls) && mc.mediaUrls.length > 0 } });
        }
      }
    }
    // ad impressions / engagements
    for (const p of want('ad-impressions')) {
      for (const it of await read(p)) for (const imp of it?.ad?.adsUserData?.adImpressions?.impressions ?? []) {
        const t = toMs(imp?.impressionTime); if (!t) continue; events.push(adEvent(imp, t, 'ad_view', p));
      }
    }
    for (const p of want('ad-engagements')) {
      for (const it of await read(p)) for (const eng of it?.ad?.adsUserData?.adEngagements?.engagements ?? []) {
        const imp = eng?.impressionAttributes ?? {};
        for (const ea of eng?.engagementAttributes ?? [{}]) { const t = toMs(ea?.engagementTime ?? imp.impressionTime); if (!t) continue; const e = adEvent(imp, t, 'ad_click', p); e.meta = { ...e.meta, engagement: ea?.engagementType ?? '' }; events.push(e); }
      }
    }
    // personalization: what X thinks of you
    for (const p of want('personalization')) {
      for (const it of await read(p)) {
        const d = it?.p13nData ?? it; if (!d) continue;
        for (const l of d.demographics?.languages ?? []) if (l?.language) claims.push({ source: 'x', field: 'inferred_language', value: String(l.language), file: p, meta: { isDisabled: !!l.isDisabled } });
        const g = d.demographics?.genderInfo?.gender; if (g) claims.push({ source: 'x', field: 'inferred_gender', value: String(g), file: p });
        const age = d.inferredAgeInfo?.age ?? d.demographics?.inferredAgeInfo?.age; if (age) claims.push({ source: 'x', field: 'inferred_age', value: String(age), file: p, meta: { birthDate: d.inferredAgeInfo?.birthDate ?? '' } });
        for (const i of d.interests?.interests ?? []) if (i?.name) claims.push({ source: 'x', field: 'ad_interest', value: String(i.name), file: p, meta: { isDisabled: !!i.isDisabled } });
        for (const i of d.interests?.partnerInterests ?? []) if (i) claims.push({ source: 'x', field: 'partner_interest', value: String(i?.name ?? i), file: p });
        const aa = d.interests?.audienceAndAdvertisers ?? {};
        for (const adv of aa.advertisers ?? []) if (adv) claims.push({ source: 'x', field: 'advertiser_audience', value: String(adv), file: p, meta: { numAudiences: Number(aa.numAudiences) || 0 } });
        for (const adv of aa.lookalikeAdvertisers ?? []) if (adv) claims.push({ source: 'x', field: 'lookalike_advertiser', value: String(adv), file: p });
        for (const loc of d.locationHistory ?? []) if (loc) claims.push({ source: 'x', field: 'location_history', value: String(loc), file: p });
        for (const s of d.interests?.shows ?? []) if (s) claims.push({ source: 'x', field: 'inferred_show', value: String(s), file: p });
      }
    }
    // account
    for (const p of want('account')) {
      for (const it of await read(p)) {
        const acc = it?.account ?? it; if (!acc) continue;
        if (acc.username) claims.push({ source: 'x', field: 'declared_username', value: String(acc.username), file: p });
        if (acc.accountDisplayName ?? acc.displayName) claims.push({ source: 'x', field: 'declared_name', value: String(acc.accountDisplayName ?? acc.displayName), file: p });
        if (acc.email) claims.push({ source: 'x', field: 'declared_email', value: mask(String(acc.email)), file: p });
        if (acc.createdAt) claims.push({ source: 'x', field: 'account_created', value: String(acc.createdAt), file: p, meta: { via: acc.createdVia ?? '' } });
      }
    }
    // follower / following counts (ids only in the archive)
    for (const p of want('follower')) claims.push({ source: 'x', field: 'followers_count', value: String((await read(p)).filter((it) => it?.follower ?? it?.accountId).length), file: p });
    for (const p of want('following')) claims.push({ source: 'x', field: 'following_count', value: String((await read(p)).filter((it) => it?.following ?? it?.accountId).length), file: p });
    // logins
    for (const p of want('ip-audit')) {
      for (const it of await read(p)) { const ia = it?.ipAudit ?? it; const t = toMs(ia?.createdAt); if (t) events.push({ ts: t, source: 'x', kind: 'login', file: p, meta: { ip: maskIp(String(ia.loginIp ?? '')) } }); }
    }
    if (!events.length && !claims.length) warnings.push('X: archive recognized but no known data/*.js parsed.');
    onProgress?.(`X: ${events.length} events, ${claims.length} claims`);
    return { source: 'x', events, claims, files, warnings } satisfies ParseResult;
  },
};

/** `window.YTD.<name>.part0 = [...]`; also tolerates re-published archives (`module.exports = [...]`) and bare JSON. */
function ytd(txt: string): any[] {
  const i = txt.indexOf('=');
  const assigned = /^\s*(window\.YTD\.|module\.exports|export default|var |const |let )/.test(txt) && i > 0;
  let body = assigned ? txt.slice(i + 1) : txt;
  const start = body.search(/[\[{]/); if (start > 0) body = body.slice(start);
  const j = safeJson<any>(body.trim().replace(/;\s*$/, ''));
  return Array.isArray(j) ? j : j ? [j] : [];
}
function adEvent(imp: any, ts: number, kind: Event['kind'], file: string): Event {
  const crit = Array.isArray(imp?.matchedTargetingCriteria) ? imp.matchedTargetingCriteria : [];
  return { ts, source: 'x', kind, actor: String(imp?.advertiserInfo?.advertiserName ?? imp?.advertiserInfo?.screenName ?? ''), title: String(imp?.promotedTweetInfo?.tweetText ?? '').slice(0, 120), file,
    meta: { location: imp?.displayLocation ?? '', targeting: crit.map((c: any) => `${c?.targetingType ?? ''}:${c?.targetingValue ?? ''}`).join('|').slice(0, 500), targetingCount: crit.length } };
}
function stripTags(s: string) { return s.replace(/<[^>]+>/g, ''); }
function mask(s: string) { return s.replace(/[^@. ](?=[^@. ]{2})/g, '•'); }
function maskIp(s: string) { if (!s) return ''; const v4 = s.split('.'); if (v4.length === 4) return `${v4[0]}.${v4[1]}.•.•`; const v6 = s.split(':'); return v6.length > 2 ? v6.slice(0, 2).join(':') + ':••' : '••'; }
