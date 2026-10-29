import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const zips = process.argv[2].split(','); const pages = (process.argv[3] ?? 'Dossier,Attention map,Deep dive').split(','); const prefix = process.argv[4] ?? 'e2e-shots/u';
const srv = spawn('python3', ['-m', 'http.server', '4802', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
try {
  await sleep(800); const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:4802/'); await page.waitForSelector('text=Drop your exports here');
  await page.setInputFiles('input[type=file]', zips); await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 120000 }); await sleep(1500); await page.keyboard.press('Escape'); await sleep(400);
  for (const p of pages) { await page.click(`nav button:has-text("${p}")`); await sleep(700); await page.screenshot({ path: `${prefix}-${p.replace(/\W+/g, '').toLowerCase()}.png`, fullPage: true }); }
  console.log('ERRORS:', errors.length ? errors.slice(0, 3) : 'none'); await browser.close();
} catch (e) { console.log('SCRIPT ERROR', e.message); } finally { srv.kill('SIGKILL'); process.exit(0); }
