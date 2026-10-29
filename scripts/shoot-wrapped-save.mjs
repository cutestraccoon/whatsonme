import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises'; import { writeFileSync } from 'node:fs';
const srv = spawn('python3', ['-m', 'http.server', '4806', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
try { await sleep(800); const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
  await page.goto('http://127.0.0.1:4806/'); await page.waitForSelector('text=Drop your exports here'); await page.click('button:has-text("Try it with sample data")');
  await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await sleep(800);
  for (let i = 0; i < 25; i++) { if (await page.$('text=Save / share image')) break; await page.keyboard.press('ArrowRight'); await sleep(200); }
  await page.screenshot({ path: 'e2e-shots/wrs-last.png' });
  const dataUrl = await page.evaluate(async () => { const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Save / share image')); const orig = HTMLCanvasElement.prototype.toBlob; let got = null; HTMLCanvasElement.prototype.toBlob = function (cb) { got = this.toDataURL('image/png'); cb(null); }; btn.click(); await new Promise((r) => setTimeout(r, 300)); HTMLCanvasElement.prototype.toBlob = orig; return got; });
  if (dataUrl) writeFileSync('e2e-shots/wrs-saved.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close(); console.log('ok'); } catch (e) { console.log('ERR', e.message); } finally { srv.kill('SIGKILL'); process.exit(0); }
