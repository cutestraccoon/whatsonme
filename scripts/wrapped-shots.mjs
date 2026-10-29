import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const zips = process.argv[2].split(',');
const srv = spawn('python3', ['-m', 'http.server', '4803', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
try {
  await sleep(800); const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1000, height: 860 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:4803/'); await page.waitForSelector('text=Drop your exports here');
  await page.setInputFiles('input[type=file]', zips); await page.waitForSelector('.wr-phone', { timeout: 120000 });
  for (let k = 0; k < 20; k++) { await sleep(1700); const el = await page.$('.wr-phone'); await el.screenshot({ path: `e2e-shots/wr-${String(k).padStart(2, '0')}.png` }); const label = await el.getAttribute('aria-label'); console.log(label); if (/^Slide (\d+) of \1$/.test(label)) break; await page.keyboard.press('ArrowRight'); }
  console.log('ERRORS:', errors.length ? errors.slice(0, 3) : 'none'); await browser.close();
} catch (e) { console.log('SCRIPT ERROR', e.message); } finally { srv.kill('SIGKILL'); process.exit(0); }
