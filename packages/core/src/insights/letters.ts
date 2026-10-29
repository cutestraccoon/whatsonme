/** Access / deletion request letters. PIPEDA (Canada) by default; GDPR and CCPA variants. */
export type Law = 'PIPEDA' | 'GDPR' | 'CCPA';
export interface LetterInput { company: string; kind: 'access' | 'deletion' | 'both'; law?: Law; yourName?: string; yourEmail?: string; yourPhone?: string; context?: string; today?: Date }

const CITE: Record<Law, { access: string; deletion: string; deadline: string; regulator: string }> = {
  PIPEDA: { access: 'Principle 4.9 (Individual Access) of Schedule 1 of the Personal Information Protection and Electronic Documents Act (PIPEDA)', deletion: 'Principle 4.5 (Limiting Use, Disclosure, and Retention) and Principle 4.9.5 of Schedule 1 of PIPEDA', deadline: '30 days (s. 8(3) PIPEDA)', regulator: 'the Office of the Privacy Commissioner of Canada' },
  GDPR: { access: 'Article 15 of the General Data Protection Regulation (GDPR)', deletion: 'Article 17 of the GDPR', deadline: 'one month (Article 12(3) GDPR)', regulator: 'my supervisory authority' },
  CCPA: { access: 'Cal. Civ. Code § 1798.110 and § 1798.115 (CCPA/CPRA)', deletion: 'Cal. Civ. Code § 1798.105 (CCPA/CPRA)', deadline: '45 days (§ 1798.130(a)(2))', regulator: 'the California Privacy Protection Agency' },
};

export function buildLetter(i: LetterInput): { subject: string; body: string } {
  const law = i.law ?? 'PIPEDA'; const c = CITE[law]; const d = (i.today ?? new Date()).toISOString().slice(0, 10);
  const who = i.yourName ?? '[YOUR FULL NAME]'; const ident = [i.yourEmail ?? '[EMAIL ON THE ACCOUNT]', i.yourPhone].filter(Boolean).join(' · ');
  const wantsAccess = i.kind !== 'deletion', wantsDelete = i.kind !== 'access';
  const subject = `${wantsAccess && wantsDelete ? 'Access and deletion' : wantsAccess ? 'Access' : 'Deletion'} request to ${i.company} under ${law} – ${who}`;
  const lines = [
    `Date: ${d}`, `To: Privacy Officer, ${i.company}`, '', `Re: ${subject}`, '',
    `I am writing to exercise my rights regarding personal information that ${i.company} holds about me. I can be identified by: ${ident}.`,
    i.context ? `Context: ${i.context}` : '',
    '',
  ];
  if (wantsAccess) lines.push(
    `1. ACCESS. Under ${c.access}, please provide me with:`,
    '   a) a complete copy of all personal information you hold about me, in a structured, commonly used machine-readable format (e.g. JSON or CSV);',
    '   b) every source from which you obtained it, including any data brokers, partners or "customer match" uploads;',
    '   c) every third party to whom it has been disclosed or sold, including advertising platforms (e.g. Meta, Google, TikTok) and the purpose of each disclosure;',
    '   d) any inferences, segments, scores or categories you have assigned to me (interest, demographic, propensity, "lookalike" or similar), and the logic behind automated profiling;',
    '   e) your retention periods for each category of information.',
    '');
  if (wantsDelete) lines.push(
    `${wantsAccess ? '2' : '1'}. DELETION. Under ${c.deletion}, please delete all personal information you hold about me that is not required by law to be retained, including any copies held by processors and any audiences built from my data on advertising platforms. Please confirm in writing when this is complete and which categories, if any, were retained and on what legal basis.`,
    '',
    `${wantsAccess ? '3' : '2'}. Please also stop any further disclosure or sale of my information to third parties, and remove me from any "custom audience" or "customer match" lists you have uploaded.`,
    '');
  lines.push(
    `You are required to respond within ${c.deadline}. If I do not receive a complete response in that time, I will file a complaint with ${c.regulator}.`,
    '', 'Please reply to this email address. I do not consent to the use of this request, or any information provided to verify my identity, for any other purpose.',
    '', 'Regards,', who,
  );
  return { subject, body: lines.filter((l) => l !== undefined).join('\n') };
}

/** Where each platform's own privacy controls live. Used by "Show me how" actions. */
export const SETTINGS_LINKS: Record<string, { label: string; url: string }[]> = {
  google: [
    { label: 'Delete & pause Location History / Timeline', url: 'https://myactivity.google.com/activitycontrols/location' },
    { label: 'Web & App Activity (search, YouTube)', url: 'https://myactivity.google.com/activitycontrols' },
    { label: 'My Ad Center: turn off personalised ads, see topics', url: 'https://myadcenter.google.com/' },
    { label: 'Delete activity by date', url: 'https://myactivity.google.com/delete-activity' },
  ],
  instagram: [
    { label: 'Your activity off Meta technologies (disconnect)', url: 'https://accountscenter.instagram.com/info_and_permissions/off_facebook_activity/' },
    { label: 'Ad preferences & interest topics', url: 'https://accountscenter.instagram.com/ads/' },
    { label: 'Audience-based advertising (advertisers using your info)', url: 'https://accountscenter.instagram.com/ads/audience_based_advertising/' },
  ],
  tiktok: [
    { label: 'Ads: personalisation, off-TikTok activity', url: 'https://www.tiktok.com/setting/ads' },
    { label: 'Download / delete your data', url: 'https://www.tiktok.com/setting/download-your-data' },
  ],
  apple: [{ label: 'Apple privacy portal', url: 'https://privacy.apple.com/' }],
  spotify: [{ label: 'Privacy settings (tailored ads)', url: 'https://www.spotify.com/account/privacy/' }],
  x: [{ label: 'Ads preferences & inferred interests', url: 'https://x.com/settings/your_twitter_data/twitter_interests' }],
  snapchat: [{ label: 'Ad preferences', url: 'https://accounts.snapchat.com/accounts/welcome' }],
  uber: [{ label: 'Privacy Center', url: 'https://myprivacy.uber.com/privacy' }],
  ios: [{ label: 'Reset advertising identifier: Settings → Privacy & Security → Tracking / Apple Advertising', url: 'https://support.apple.com/en-ca/HT202074' }],
  android: [{ label: 'Delete / reset advertising ID: Settings → Google → Ads', url: 'https://support.google.com/googleplay/android-developer/answer/6048248' }],
};
