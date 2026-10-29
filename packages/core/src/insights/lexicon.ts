/** Keyword lexicon: text -> topic and mood. Tune with user feedback; keep it transparent. */
export type Mood = 'Learn' | 'Aspire' | 'Comfort' | 'Doom' | 'Funny' | 'Social' | 'Neutral';

export interface TopicDef { topic: string; mood: Mood; kw: RegExp }

export const TOPICS: TopicDef[] = [
  { topic: 'Real estate & property', mood: 'Aspire', kw: /\b(condo|apartment|mortgage|pre-?construction|realtor|real estate|house tour|home tour|rent|landlord|airbnb|zillow|realtor\.ca|mls|open house|down ?payment|cmhc)\b/i },
  { topic: 'Cars & EVs', mood: 'Aspire', kw: /\b(tesla|ev|electric vehicle|car review|lease|bmw|mercedes|porsche|rivian|lucid|hyundai|kia|toyota|honda|civic|cx-?30|range|0-60|horsepower|supercar)\b/i },
  { topic: 'Finance & investing', mood: 'Learn', kw: /\b(stock|stocks|etf|dividend|invest(ing|ment)?|portfolio|tfsa|rrsp|fed|interest rate|inflation|bond|yield|earnings|valuation|berkshire|buffett|options|crypto|bitcoin|ethereum)\b/i },
  { topic: 'Business & startups', mood: 'Learn', kw: /\b(startup|founder|saas|revenue|business plan|pitch|vc|venture|mrr|arr|shopify|dropship|side ?hustle|entrepreneur|how i built|y ?combinator|product market fit)\b/i },
  { topic: 'AI & tech', mood: 'Learn', kw: /\b(ai|gpt|llm|openai|claude|gemini|ollama|machine learning|neural|python|cursor|github|linux|gpu|rtx|nvidia|benchmark|open[- ]source|prompt|agent|coding|programming|javascript|rust)\b/i },
  { topic: 'Gaming', mood: 'Comfort', kw: /\b(cs2|counter-?strike|valorant|call of duty|cod|warzone|fortnite|minecraft|steam|xbox|playstation|ps5|nintendo|speedrun|gameplay|ranked|fps|esports|twitch)\b/i },
  { topic: 'Music', mood: 'Comfort', kw: /\b(song|album|remix|lyrics|official video|official audio|live performance|concert|dj|playlist|beat|r&b|rap|hip ?hop|arabic music|habibi|tarab)\b/i },
  { topic: 'Cooking & food', mood: 'Comfort', kw: /\b(recipe|cook(ing)?|kitchen|espresso|coffee|chef|meal prep|air fryer|bake|baking|restaurant|food tour|street food|ramen|shawarma|kebab)\b/i },
  { topic: 'Fitness & health', mood: 'Learn', kw: /\b(workout|gym|protein|calorie|deadlift|bench|running|marathon|yoga|sleep|fasting|supplement|creatine|weight loss|fat loss|hypertrophy)\b/i },
  { topic: 'Luxury & watches', mood: 'Aspire', kw: /\b(rolex|omega|patek|audemars|ap royal oak|watch collection|luxury|yacht|first class|business class|louis vuitton|hermes|gucci|unboxing)\b/i },
  { topic: 'Travel', mood: 'Aspire', kw: /\b(travel|flight|hotel|itinerary|vlog|trip to|visa|passport|dubai|japan|tokyo|paris|bali|resort|all-?inclusive)\b/i },
  { topic: 'News & politics', mood: 'Doom', kw: /\b(election|trump|biden|trudeau|poilievre|carney|parliament|senate|tariff|war|ukraine|gaza|israel|iran|china|breaking|protest|scandal|indicted|supreme court)\b/i },
  { topic: 'Crash & layoff content', mood: 'Doom', kw: /\b(crash|recession|collapse|layoffs?|fired|bubble|housing crisis|bankrupt|debt crisis|market meltdown|is it over|worst|disaster|exposed|scam|warning)\b/i },
  { topic: 'Documentaries & explainers', mood: 'Learn', kw: /\b(documentary|explained|the rise of|the fall of|how .* works|history of|why .* failed|deep dive|investigation|inside the|what happened to)\b/i },
  { topic: 'Arab & Middle East culture', mood: 'Comfort', kw: /\b(arab|arabic|egypt|egyptian|palestin\w*|lebanon|lebanese|syria\w*|jordan\w*|habibi|yalla|khaleeji|cairo|gaza|dabke|shawarma|ramadan|eid)\b/i },
  { topic: 'Podcasts & interviews', mood: 'Learn', kw: /\b(podcast|episode|interview|subwaytakes|street interview|hot take|debate)\b/i },
  { topic: 'Comedy & memes', mood: 'Funny', kw: /\b(meme|funny|lol|lmao|skit|prank|try not to laugh|comedy|stand-?up|roast|fail|bloopers|tiktok compilation|😂|💀)\b/i },
  { topic: 'Spirituality & religion', mood: 'Comfort', kw: /\b(quran|islam|sufi|dua|ramadan|prayer|bible|church|meditation|spiritual|nafs|dhikr|sermon|khutbah)\b/i },
  { topic: 'Dating & relationships', mood: 'Social', kw: /\b(dating|relationship|girlfriend|boyfriend|marriage|wedding|red flags|situationship|breakup|first date)\b/i },
  { topic: 'Sports', mood: 'Comfort', kw: /\b(nba|nfl|nhl|mlb|premier league|champions league|raptors|leafs|blue jays|messi|ronaldo|highlights|goal|match|ufc|f1|formula 1|soccer|football|futbol|worldcup|world cup|fifa|laliga|la liga|real ?madrid|barcelona|liverpool|basketball|hockey|tfc|toronto fc|zlatan|mbapp[eé]|salah|striker|penalty)\b/i },
  { topic: 'Home & DIY', mood: 'Aspire', kw: /\b(renovation|reno|ikea|diy|home decor|interior design|smart home|home assistant|garden|hydroponic|plants)\b/i },
  { topic: 'Shopping & deals', mood: 'Aspire', kw: /\b(haul|review|best .* 2026|worth it|unboxing|deal|amazon|costco|black friday|sale|buy)\b/i },
];

export function classify(text: string | undefined): { topic: string; mood: Mood } {
  if (!text) return { topic: 'Other', mood: 'Neutral' };
  for (const t of TOPICS) if (t.kw.test(text)) return { topic: t.topic, mood: t.mood };
  return { topic: 'Other', mood: 'Neutral' };
}

export const MOOD_ORDER: Mood[] = ['Learn', 'Aspire', 'Comfort', 'Doom', 'Funny', 'Social'];
export const MOOD_EXAMPLES: Record<Mood, string> = {
  Learn: 'explainers, tutorials, finance', Aspire: 'tours, reveals, unboxings', Comfort: 'music, cooking, gaming, friends',
  Doom: 'crashes, layoffs, outrage', Funny: 'memes, skits', Social: 'dating, relationships', Neutral: 'uncategorised',
};

/** Classify an event from its title, owner and hashtags; memoized because several insight passes ask about the same event. */
const memo = new WeakMap<object, { topic: string; mood: Mood }>();
export function classifyEvent(e: { title?: string; actor?: string; meta?: Record<string, unknown> }): { topic: string; mood: Mood } {
  const hit = memo.get(e); if (hit) return hit;
  const tags = typeof e.meta?.tags === 'string' ? (e.meta.tags as string).replace(/\s+/g, ' ') : '';
  const r = classify(`${e.title ?? ''} ${e.actor ?? ''} ${tags}`.trim() || undefined);
  memo.set(e, r); return r;
}
