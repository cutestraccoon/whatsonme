# Big Brother

See what the algorithm decided you are. Drop the data exports that Google, Meta, TikTok, Apple and others are legally required to give you, and get back a dossier: every inferred attribute with the evidence behind it, the file it came from, who it's sold to, and when each feed has you.

**Nothing leaves your machine.** Lite parses inside your browser tab. Desktop runs a local server bound to 127.0.0.1 with no outbound network calls.

## Quick start

```bash
npm install
npm run build          # typecheck + build the Lite web app
npm run desktop        # local server → http://127.0.0.1:4747 (serves Lite + deep-audit collectors)
```

Try it with fake data first: click **Try it with sample data** on the first screen (14 synthetic sources, nobody real), or write the zips to disk:

```bash
npx tsx scripts/write-samples.mts sample-exports
```

Lite only (no server, pure static): `npm run dev` or host `apps/lite/dist` anywhere. It is a PWA: installs to the home screen and works offline. See **DEPLOY.md** for Cloudflare/Netlify and the CSP that makes "nothing leaves your device" enforceable by the browser.

## What's in the box

| Path | What |
|---|---|
| `packages/core` | TypeScript library: archive readers (zip/folder, streaming for huge Takeouts), **14 parsers**, insights engine, 20 tests on synthetic fixtures |
| `apps/lite` | Vite + React app. Drop zone → **Wrapped** story (tap-through, saves a 1080×1920 image) → Your file → Who has it → Habits → Deep dive → Letters. Web Worker parsing with in-page fallback. |
| `apps/desktop` | Node local server. Serves Lite, adds browser-history collectors (Chrome/Edge/Brave/Firefox/Safari via sql.js), Apple Health, local zip/folder import, Downloads auto-detect. |
| `scripts/*.mjs` | Playwright runs: `shoot.mjs` (your zips → every page), `shoot-sample.mjs` (sample data), `release-check.mjs` (edge cases: bad files, single source, keep+reload, mobile). |

### Parsers (`packages/core/src/parsers`)

Fun tier: **Instagram/Meta**, **TikTok**, **Google Takeout + YouTube** (My Activity, watch-history, Semantic Location History, new on-device `Timeline.json`, Chrome, Play Store, Access Log), **Apple** (Media Services CSVs + Health `export.xml`).

Deep audit: **Spotify** (incl. `Inferences.json`), **X** (`personalization.js`: inferred age/gender, interests, lookalike advertisers), **Snapchat**, **Uber**, **WhatsApp** (counts and timing only, never content), **Tinder / Hinge / Bumble**, **Steam / Discord**, **browser history** (desktop).

Every event is normalized to `{ts, source, kind, title?, url?, actor?, value?, lat?, lon?, meta?, file}`; `file` is the receipt path inside the export. Platform-asserted facts (inferred age, ad interests, advertisers who uploaded your contact info, inferred home/work) are `Claim`s.

### Insights (`packages/core/src/insights`)

- **Dossier**: inferred attributes with `why / used for / receipt` and confidence. Only rows the data supports.
- **Flags**: behavioural segments (Likely to move, Small business owner, Engaged shopper, Frequent traveller, Late-night high receptivity…).
- **Routine**: home / work / second base from location clusters, transport mode + confidence, 7×24 grid.
- **Attention**: 7×24 watch and like grids per platform, peak window, longest session, work-hours leak, clean hours, like-to-watch ratio.
- **Feeds**: each platform's model of you (your_topics.json, TikTok ad interests, YouTube rebuilt), with "because:" evidence and "never searched, pushed by the feed" detection.
- **Mood & eras**: keyword lexicon → topic + mood (`Learn / Aspire / Comfort / Doom / Funny / Social`), 12-week stacked shares, shift detection tied to a preceding search, monthly eras with feed-driven vs self-driven share.
- **Snitches**: advertisers split into *uploaded your contact info* vs *watched you via pixel*.
- **Score**: 0–100 exposure from five explainable parts. **Actions** each carry the points they remove.

The lexicon (`insights/lexicon.ts`) is deliberately transparent and small. Tune it; or swap `classify()` for a local LLM call.

## Privacy rules baked in

- No upload endpoint exists. CSP in `index.html` blocks everything except self, Google Fonts and localhost.
- Desktop: 127.0.0.1 only, Host-header check, import paths restricted to your home folder, browser URLs stripped of query strings and token-looking paths.
- Emails and phones are masked at parse time. Message bodies are never stored (length + timestamp only).
- Share card never includes location, device identifiers or declared identity fields.

## Known gaps / honest notes

- Parsers were built from documented export formats and tested on synthetic fixtures, not on every real export version. Expect to patch key names when platforms change them. Warnings surface in the UI.
- Google Ad Center demographics (income bracket, parental status) are not in standard Takeout; the parser picks them up if present, otherwise the dossier derives weaker proxies and labels them `Derived · LOW`.
- Mood classification is keyword-based. It is good at "condo tour vs layoff compilation", bad at sarcasm.
- Big Takeouts (tens of GB) should go through Desktop (`/api/import` streams and skips media). Lite loads zips into memory.
- Google Data Portability API (OAuth, no zip) is the right next step for "instant" Google; it needs app verification and regional availability checks.

## Scripts

- `npm test` — core tests. `npm test -w @bigbrother/desktop` — server + collector tests.
- `npm run build` — core typecheck + Lite build to `apps/lite/dist`.
- `node scripts/e2e.mjs` — browser end-to-end (needs Playwright + Chromium).

MIT.
