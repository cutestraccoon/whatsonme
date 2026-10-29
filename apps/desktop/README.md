# Big Brother Desktop

A tiny localhost-only server that lets the Big Brother UI read data that a browser tab can't:
your browser history databases and the export zips sitting in `~/Downloads`.

**Nothing leaves your machine.** The server binds to `127.0.0.1` only, makes zero outbound
requests, sets no CORS headers, and rejects any request whose `Host` header isn't
`127.0.0.1`/`localhost` (DNS-rebinding protection). `/api/netcheck` always answers
`{"outbound":false}`; the UI shows it as "0 bytes out".

## Run

```sh
# from the repo root
npm install
npm run build      # builds the web UI into apps/lite/dist (optional; API works without it)
npm run desktop    # -> Big Brother Desktop → http://127.0.0.1:4747
```

The browser opens automatically (best effort). Set `PORT=5000` to change the port,
`BB_NO_OPEN=1` to skip opening the browser. Aspiration: `npx bigbrother-desktop` (a `bin`
launcher is included; publishing is not wired up yet).

Requires Node 22. No native modules: SQLite is read through `sql.js` (WASM), zips through `fflate`.

## What it reads

| Source | Where it looks | How |
| --- | --- | --- |
| Chrome / Chromium / Edge / Brave | `Default` + `Profile N` → `History` under the platform's user-data dir (Windows `%LOCALAPPDATA%`, macOS `~/Library/Application Support`, Linux `~/.config`) | Copies the SQLite file to a temp dir first (the browser locks the live one), then `visits JOIN urls`. WebKit microseconds → unix ms. |
| Firefox | `places.sqlite` in each profile | `moz_historyvisits JOIN moz_places`, `visit_date` µs → ms |
| Safari (macOS) | `~/Library/Safari/History.db` | `history_visits JOIN history_items`, seconds since 2001 → ms |
| Export archives | `~/Downloads`, `~/Desktop` | By filename: `takeout-*.zip`, `instagram-*.zip`, `user_data_tiktok*.zip/json`, `my_spotify_data*.zip`, `*twitter*.zip` / `x-*.zip`, `mydata*.zip` (Snapchat), `Uber-*.zip`, `apple_health_export*.zip`, `WhatsApp Chat*.txt` |

Detection (`GET /api/sources`) only `stat`s paths; nothing is opened until you click Collect.

Browser URLs are stored without their query string / fragment, and any URL containing
`token=`, `session`, `password`, `secret`, `api_key`, `auth=`, `otp=` is dropped entirely.

## Point it at an export zip or folder

`POST /api/import {"path": "/Users/you/Downloads/takeout-20250101.zip"}` reads a zip, an
extracted folder, or a single file (`export.xml`, one `*.json`, a WhatsApp `*.txt`) and runs every
core parser that recognizes it. Rules:

- The path must be inside your home directory (under WSL, `/mnt/c/Users/...` is also allowed).
- Zips up to 400 MB are unzipped in memory; bigger ones are streamed and only text-like files
  (json/csv/txt/html/xml/...) are kept, so media never has to fit in RAM.
- Responses are capped at 300 000 events per source; above that the list is evenly sampled and a
  `sampled: ...` warning is added.

Apple Health: export from the Health app (profile → Export All Health Data), leave
`apple_health_export.zip` in `~/Downloads`; it shows up as a source and goes through core's apple parser.

## API

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/ping` | `{desktop, version, platform, home}` |
| GET | `/api/netcheck` | `{outbound:false}` |
| GET | `/api/sources` | `[{id, label, path, bytes, kind:'collector'|'archive', source}]` |
| POST | `/api/collect` `{id}` | one `ParseResult` |
| POST | `/api/import` `{path}` | `ParseResult[]` |

Everything else serves `apps/lite/dist` (SPA fallback to `index.html`), or a placeholder page
telling you to run `npm run build`.

## WSL2 note

When running inside WSL2 (detected via `/proc/version`), the detector also scans the Windows side:
`/mnt/c/Users/<you>/AppData/Local/{Google/Chrome,Microsoft/Edge,BraveSoftware/Brave-Browser}/User Data/*/History`,
`AppData/Roaming/Mozilla/Firefox/Profiles/*/places.sqlite`, and `/mnt/c/Users/<you>/Downloads`.
Those entries are labelled `[Windows]`. Open `http://127.0.0.1:4747` from your Windows browser; WSL2
forwards localhost. Close the browser (or at least don't fight it) if a History copy fails with a
sharing-violation error on the 9p mount.

## Develop

```sh
npm test -w @bigbrother/desktop        # vitest: browser collector + FolderArchive + HTTP API
npm run typecheck -w @bigbrother/desktop
```

Layout:

- `src/server.ts` – HTTP server + API, static files, host check, path sandbox, event cap
- `src/sources.ts` – auto-detection of browsers and export zips
- `src/sqlite.ts` – sql.js loader (`createRequire` so the `.wasm` resolves under ESM)
- `src/collectors/browser.ts` – Chromium/Firefox/Safari history → `Event{source:'browser',kind:'visit'}`
- `src/collectors/folder.ts` – `FolderArchive`: an extracted export folder as a core `Archive`
- `src/collectors/archive.ts` – open zip / folder / single file as an `Archive`
- `src/collectors/health.ts` – Apple Health zip or `export.xml` → core apple parser
- `src/core.ts` – the only place that imports from `@bigbrother/core`
