import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const zips = process.argv[2]; const prefix = process.argv[3] ?? 'e2e-shots/pp';
const srv = spawn('python3', ['-m', 'http.server', '4804', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
try {
  await sleep(800); const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:4804/'); await page.waitForSelector('text=Drop your exports here');
  if (zips === 'sample') await page.click('button:has-text("Try it with sample data")'); else await page.setInputFiles('input[type=file]', zips.split(','));
  await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await sleep(1200);
  await page.keyboard.press('Escape'); await sleep(300); await page.click('nav button:has-text("Passport")'); await sleep(1200);
  for (let i = 0; i < 12; i++) { await page.screenshot({ path: `${prefix}-${String(i).padStart(2, '0')}.png` }); if (await page.$('text=Save passport image')) break; await page.keyboard.press('ArrowRight'); await sleep(1400); }
  // saved image
  const dataUrl = await page.evaluate(async () => { const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Save passport image')); const orig = HTMLCanvasElement.prototype.toBlob; let got = null; HTMLCanvasElement.prototype.toBlob = function (cb) { got = this.toDataURL('image/png'); cb(null); }; btn.click(); await new Promise((r) => setTimeout(r, 300)); HTMLCanvasElement.prototype.toBlob = orig; return got; });
  if (dataUrl) { const fs = await import('node:fs'); fs.writeFileSync(`${prefix}-saved.png`, Buffer.from(dataUrl.split(',')[1], 'base64')); }
  console.log('ERRORS:', errors.length ? errors.slice(0, 3) : 'none'); await browser.close();
} catch (e) { console.log('SCRIPT ERROR', e.message); } finally { srv.kill('SIGKILL'); process.exit(0); }
