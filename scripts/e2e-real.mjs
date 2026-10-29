import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const zips = process.argv[2].split(','); const shot = process.argv[3] ?? 'e2e-shots/real.png';
const srv = spawn('python3', ['-m', 'http.server', '4801', '--bind', '127.0.0.1', '--directory', 'apps/lite/dist'], { stdio: 'ignore' });
const kill = () => { try { srv.kill('SIGKILL'); } catch {} };
try {
  await sleep(800);
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:4801/'); await page.waitForSelector('text=Drop your exports here', { timeout: 15000 });
  const t0 = Date.now(); await page.setInputFiles('input[type=file]', zips);
  const ok = await Promise.race([page.waitForSelector('text=The algorithm has decided', { timeout: 90000 }).then(() => true), page.waitForSelector('[role=status]:has-text("✕")', { timeout: 90000 }).then(() => false)]);
  console.log(ok ? 'OK' : 'FAILED', Date.now() - t0, 'ms');
  await sleep(600); await page.screenshot({ path: shot, fullPage: false });
  await page.click('nav button:has-text("Sources")').catch(() => {}); await sleep(300);
  console.log('BANNER:', (await page.textContent('[role=status]').catch(() => ''))?.slice(0, 300));
  if (ok) { await page.click('nav button:has-text("Deep dive")'); await sleep(500); await page.screenshot({ path: shot.replace('.png', '-deepdive.png'), fullPage: true }); }
  console.log('ERRORS:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
} catch (e) { console.log('SCRIPT ERROR', e.message); } finally { kill(); process.exit(0); }
