import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const srv = spawn('python3', ['-m', 'http.server', '4804', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
try {
  await sleep(800); const browser = await chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 860 } }); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4804/'); await page.waitForSelector('text=Drop your exports here');
  await page.setInputFiles('input[type=file]', process.argv[2].split(',')); await page.waitForSelector('.wr-phone', { timeout: 120000 });
  for (let k = 0; k < 25; k++) { if (await page.$('text=Save / share image')) break; await page.keyboard.press('ArrowRight'); await sleep(150); }
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('text=Save / share image')]);
  await dl.saveAs('e2e-shots/wrapped-saved.png'); console.log('saved'); await browser.close();
} catch (e) { console.log('SCRIPT ERROR', e.message); } finally { srv.kill('SIGKILL'); process.exit(0); }
