import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const srv = spawn('node', ['scripts/serve-strict.mjs', '4810'], { stdio: 'ignore' }); const out = [];
try { await sleep(800); const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || /Content Security|Refused/.test(m.text())) errs.push(m.type().toUpperCase() + ' ' + m.text().slice(0, 220)); });
  await page.goto('http://127.0.0.1:4810/'); await page.waitForSelector('text=Drop your exports here'); await sleep(2500);
  out.push('SW registered: ' + await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration())));
  out.push('manifest: ' + await page.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href')));
  out.push('font loaded: ' + await page.evaluate(() => document.fonts.check('700 16px "Space Grotesk"')));
  const reqs = []; page.on('request', (r) => reqs.push(r.url()));
  await page.click('button:has-text("Try it with sample data")'); await page.waitForSelector('nav button:not([disabled]):has-text("Your file")', { timeout: 180000 }); await sleep(800);
  out.push('external requests during parse: ' + reqs.filter((u) => !u.startsWith('http://127.0.0.1:4810/')).join(', ') || 'none');
  await page.screenshot({ path: 'e2e-shots/pwa-m-wrapped.png' });
  // offline: go offline, reload, app still loads
  const ctx = page.context(); await ctx.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(2000);
  out.push('offline reload shows app: ' + !!(await page.$('text=Drop your exports here'))); await ctx.setOffline(false);
  await page.screenshot({ path: 'e2e-shots/pwa-m-setup.png', fullPage: true });
  out.push('errors: ' + (errs.length ? errs.join(' | ') : 'none'));
  await browser.close(); } catch (e) { out.push('SCRIPT ERROR ' + e.message); } finally { srv.kill('SIGKILL'); console.log(out.join('\n')); process.exit(0); }
