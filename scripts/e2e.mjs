// End-to-end: serve Lite via the Desktop server, upload sample zips in Chromium, screenshot each page.
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req(process.env.PLAYWRIGHT_PATH ?? '/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4799; const out = 'e2e-shots'; mkdirSync(out, { recursive: true });
const srv = spawn('npx', ['tsx', 'apps/desktop/src/server.ts'], { env: { ...process.env, PORT: String(PORT), BB_NO_OPEN: '1' }, stdio: 'inherit' });
try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/ping`); if (r.ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForSelector('text=Drop your exports here');
  await page.screenshot({ path: `${out}/1-setup.png`, fullPage: true });
  await page.setInputFiles('input[type=file]', ['sample-exports/instagram-sample.zip', 'sample-exports/user_data_tiktok-sample.zip', 'sample-exports/takeout-sample.zip', 'sample-exports/apple-sample.zip']);
  await page.waitForSelector('text=The algorithm has decided', { timeout: 60000 });
  await sleep(800); await page.screenshot({ path: `${out}/2-dossier.png`, fullPage: true });
  const verdict = await page.textContent('h1'); const summary = await page.textContent('.callout p');
  await page.click('.row-btn >> nth=1'); await sleep(200);
  await page.click('nav button:has-text("Attention")'); await page.waitForSelector('text=Your week, hour by hour'); await sleep(500); await page.screenshot({ path: `${out}/3-attention.png`, fullPage: true });
  await page.click('button.pill:has-text("Liked")'); await sleep(300); await page.screenshot({ path: `${out}/3b-attention-liked.png`, fullPage: false });
  await page.click('nav button:has-text("Dossier")'); await page.waitForSelector('text=Creepiest finds'); await page.click('button.pill:has-text("Reveal all")'); await sleep(300); await page.screenshot({ path: `${out}/2b-finds.png`, fullPage: false });
  await page.click('nav button:has-text("Deep dive")'); await page.waitForSelector('text=Who you like'); await sleep(400); await page.screenshot({ path: `${out}/2c-deepdive.png`, fullPage: true });
  await page.click('nav button:has-text("Letters")'); await page.waitForSelector('text=letters ready'); await sleep(300); await page.screenshot({ path: `${out}/3c-letters.png`, fullPage: true });
  const letterCount = await page.textContent('h2:has-text("letters ready")');
  await page.click('nav button:has-text("Share")'); await page.waitForSelector('canvas'); await sleep(1200); await page.screenshot({ path: `${out}/4-share.png`, fullPage: true });
  const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  await import('node:fs').then((fs) => fs.writeFileSync(`${out}/share-card.png`, Buffer.from(png.split(',')[1], 'base64')));
  await page.click('nav button:has-text("Sources")'); await sleep(400); await page.screenshot({ path: `${out}/5-sources-after.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.click('nav button:has-text("Dossier")'); await sleep(500); await page.screenshot({ path: `${out}/6-mobile-dossier.png`, fullPage: false });
  console.log('VERDICT:', verdict); console.log('LETTERS:', letterCount); console.log('SUMMARY:', summary); console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close(); process.exit(0);
} finally { srv.kill(); }
