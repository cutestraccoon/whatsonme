import { createRequire } from 'node:module'; const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req('/opt/npm-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process'; import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 4798; const srv = spawn('npx', ['tsx', 'apps/desktop/src/server.ts'], { env: { ...process.env, PORT: String(PORT), BB_NO_OPEN: '1' }, stdio: 'ignore' });
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/ping`)).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.route('**/assets/worker-*.js', (r) => r.abort());
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForSelector('text=Drop your exports here');
  const t0 = Date.now();
  await page.setInputFiles('input[type=file]', ['sample-exports/instagram-sample.zip']);
  await page.waitForSelector('text=The algorithm has decided', { timeout: 60000 });
  console.log('FALLBACK OK in', Date.now() - t0, 'ms; errors:', errors.length ? errors : 'none');
  await page.click('nav button:has-text("Sources")'); await sleep(300); console.log('BANNER:', await page.textContent('[role=status]'));
  await browser.close(); process.exit(0);
} finally { srv.kill(); }
