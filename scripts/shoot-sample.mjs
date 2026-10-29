import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const prefix = process.argv[2] ?? 'e2e-shots/sample'; const mobile = process.argv[3] === 'm';
const srv = spawn('python3', ['-m', 'http.server', '4803', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
try {
  await sleep(800); const browser = await chromium.launch(); const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:4803/'); await page.waitForSelector('text=Drop your exports here');
  await page.click('button:has-text("Try it with sample data")'); await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await sleep(1500);
  // wrapped slides
  for (let i = 0; i < 20; i++) { await page.screenshot({ path: `${prefix}-wr-${String(i).padStart(2, '0')}.png` }); const last = await page.$('text=Save / share image'); if (last) break; await page.keyboard.press('ArrowRight'); await sleep(900); }
  await page.keyboard.press('Escape'); await sleep(400);
  for (const p of ['Your file', 'Who has it', 'Habits', 'Deep dive', 'Letters', 'Sources']) { await page.click(`nav button:has-text("${p}")`); await sleep(700); await page.screenshot({ path: `${prefix}-${p.replace(/\W+/g, '').toLowerCase()}.png`, fullPage: true }); }
  console.log('ERRORS:', errors.length ? errors.slice(0, 3) : 'none'); await browser.close();
} catch (e) { console.log('SCRIPT ERROR', e.message); } finally { srv.kill('SIGKILL'); process.exit(0); }
