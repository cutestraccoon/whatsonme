import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises'; import { writeFileSync } from 'node:fs';
const srv = spawn('python3', ['-m', 'http.server', '4805', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
const out = [];
try {
  await sleep(800); const browser = await chromium.launch();
  const mk = async (opts) => { const page = await browser.newPage(opts); const errs = []; page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); }); await page.goto('http://127.0.0.1:4805/'); await page.waitForSelector('text=Drop your exports here'); return { page, errs }; };
  // 1. unsupported file
  { const { page, errs } = await mk({}); writeFileSync('/tmp/junk.txt', 'hello'); await page.setInputFiles('input[type=file]', ['/tmp/junk.txt']); await sleep(3000); const st = await page.textContent('[role=status]'); out.push('junk file → status: ' + st?.slice(0, 140)); out.push('errors: ' + (errs.join(' | ') || 'none')); await page.close(); }
  // 2. nav disabled before data
  { const { page } = await mk({}); const dis = await page.$$eval('nav button[disabled]', (b) => b.map((x) => x.textContent)); out.push('disabled before data: ' + dis.join(', ')); await page.close(); }
  // 3. single source (TikTok only) → all pages + wrapped last slide + NaN scan
  { const { page, errs } = await mk({}); await page.setInputFiles('input[type=file]', ['${process.env.BB_TIKTOK_ZIP ?? 'sample-exports/user_data_tiktok-sample.zip'}']); await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await sleep(1000);
    let n = 0; for (; n < 25; n++) { if (await page.$('text=Save / share image')) break; await page.keyboard.press('ArrowRight'); await sleep(250); } out.push('tiktok-only wrapped slides reached end after ' + n + ' presses');
    let nan = (await page.textContent('body'))?.match(/\bNaN\b|undefined|Infinity/g); out.push('wrapped NaN/undefined: ' + (nan ? nan.length : 0));
    await page.keyboard.press('Escape'); await sleep(300);
    for (const p of ['Your file', 'Who has it', 'Habits', 'Deep dive', 'Letters', 'Sources']) { await page.click(`nav button:has-text("${p}")`); await sleep(500); const t = await page.textContent('main'); const m = t?.match(/\bNaN\b|undefined|Infinity/g); out.push(`tiktok-only ${p}: NaN/undefined=${m ? m.length : 0}`); }
    out.push('tiktok-only errors: ' + (errs.join(' | ') || 'none'));
    // forget everything
    await page.click('nav button:has-text("Sources")'); await page.click('button:has-text("Forget everything")'); await sleep(500); const dis = await page.$$eval('nav button[disabled]', (b) => b.length); out.push('after forget: disabled nav count=' + dis + ', status=' + (await page.textContent('h1'))?.slice(0, 40)); await page.close(); }
  // 4. keep on device → reload restores
  { const { page, errs } = await mk({}); await page.setInputFiles('input[type=file]', ['${process.env.BB_TIKTOK_ZIP ?? 'sample-exports/user_data_tiktok-sample.zip'}']); await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await page.keyboard.press('Escape'); await page.click('nav button:has-text("Sources")'); await page.check('input[type=checkbox]'); await sleep(1500); await page.reload(); await sleep(6000); const ok = await page.$('nav button:not([disabled]):has-text("Your file")'); out.push('keep+reload restored: ' + !!ok + ' errors: ' + (errs.join(' | ') || 'none')); await page.evaluate(() => indexedDB.databases?.().then((d) => d.forEach((x) => indexedDB.deleteDatabase(x.name)))); await page.close(); }
  // 5. mobile wrapped + sample
  { const { page, errs } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await page.click('button:has-text("Try it with sample data")'); await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await sleep(800); await page.screenshot({ path: 'e2e-shots/rel-m-wrapped.png' }); const sw = await page.evaluate(() => document.documentElement.scrollWidth); out.push('mobile wrapped scrollWidth=' + sw + ' errors: ' + (errs.join(' | ') || 'none')); await page.keyboard.press('Escape'); for (const p of ['Your file', 'Who has it', 'Habits', 'Deep dive', 'Letters', 'Sources']) { await page.click(`nav button:has-text("${p}")`); await sleep(400); const w = await page.evaluate(() => document.documentElement.scrollWidth); out.push(`mobile ${p} scrollWidth=${w}`); } await page.close(); }
  await browser.close();
} catch (e) { out.push('SCRIPT ERROR ' + e.message); } finally { srv.kill('SIGKILL'); console.log(out.join('\n')); process.exit(0); }
