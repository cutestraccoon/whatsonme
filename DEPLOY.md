# Deploying Big Brother (web / phone)

The app is static files. There is no server, no database, no account. `apps/lite/dist` is the whole product.

## 1. Build
```bash
npm install
npm run build            # → apps/lite/dist
```

## 2. Host (pick one)
- **Cloudflare Pages** (recommended, free): new project → upload `apps/lite/dist` (or connect the repo with build command `npm run build`, output `apps/lite/dist`). The `_headers` file inside dist is applied automatically.
- **Netlify**: drag `apps/lite/dist` onto the dashboard. `_headers` is applied automatically.
- **GitHub Pages / any plain static host**: works, but custom headers are not supported there. The page-level `<meta>` CSP (`connect-src 'none'`) still applies, so the app still cannot send data anywhere; you only lose the extra header hardening.

Then point a domain at it. HTTPS is required for install-to-home-screen and offline mode; all three hosts provide it.

## 3. What makes "local only" provable
- `index.html` carries `Content-Security-Policy … connect-src 'none'`: the browser refuses every `fetch`/XHR/WebSocket from the page, even if a future bug tried. Users can confirm in DevTools → Network: zero requests after load.
- Fonts are bundled (`@fontsource/space-grotesk`), so there is no third-party request at all.
- No analytics, no error reporting, no cookies. The only storage is IndexedDB on the user's device, and only if they tick "Keep my parsed file".
- The service worker precaches the app so it runs offline; the airplane-mode test on the first screen is real.

## 4. Phones
- iOS Safari: Share → **Add to Home Screen**. Android Chrome: the app shows an **Install** card. Both then run full-screen and offline.
- Exports arrive as a zip in Files (iOS) or Downloads (Android); the user taps **Choose files** and picks it. Instagram's ~150 MB zip parses on a phone because the zip is streamed and media is skipped.
- Saved Wrapped images go through the native share sheet straight to TikTok / Instagram.

## 5. Updating
Rebuild and re-upload. Installed copies show a "new version is ready → Reload" bar on next open.

## 6. Desktop (optional, deep-audit tier)
`npm run desktop` runs a loopback-only server that adds browser-history collectors. It serves the same build and rewrites the CSP so the page may talk to 127.0.0.1 only.
