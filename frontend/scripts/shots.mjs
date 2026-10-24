// Real-browser screenshots with local Edge. Usage: node scripts/shots.mjs <round> [scenario...]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5175';
const [round = 'latest', ...only] = process.argv.slice(2);
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../output/shots', round);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const desk = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const wait = (page, ms = 1200) => page.waitForTimeout(ms);

const scenarios = {
  'guide': [desk, async p => { await p.goto(BASE + '/'); await wait(p, 4000); }],
  'guide-hover': [desk, async p => { await p.goto(BASE + '/'); await wait(p); await p.hover('.epg-list li:nth-child(3) .epg-row'); await wait(p, 900); }],
  'guide-full': [desk, async p => { await p.goto(BASE + '/'); await wait(p, 1500); }, true],
  'channel': [desk, async p => { await p.goto(BASE + '/lin-mo'); await wait(p, 2200); }],
  'channel-full': [desk, async p => { await p.goto(BASE + '/chen-yu'); await wait(p, 2200); }, true],
  'work': [desk, async p => { await p.goto(BASE + '/chen-yu/w/chen-yu-1'); await wait(p, 1500); }],
  'video': [desk, async p => { await p.goto(BASE + '/lin-mo/w/polyv-demo'); await wait(p, 5000); }],
  'tune': [desk, async p => { await p.goto(BASE + '/tune'); await wait(p, 1500); }],
  'login': [desk, async p => { await p.goto(BASE + '/login'); await wait(p); }],
  'phone-guide': [phone, async p => { await p.goto(BASE + '/'); await wait(p, 1500); }],
  'phone-channel': [phone, async p => { await p.goto(BASE + '/chen-yu'); await wait(p, 2200); }],
  'phone-tune': [phone, async p => { await p.goto(BASE + '/tune'); await wait(p, 1500); }],
  'phone-work': [phone, async p => { await p.goto(BASE + '/chen-yu/w/chen-yu-1'); await wait(p, 1500); }],
};

const errors = [];
for (const [name, [viewport, steps, fullPage]] of Object.entries(scenarios)) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  try {
    await steps(page);
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: !!fullPage });
    console.log('ok', name);
  } catch (e) {
    console.log('FAIL', name, e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}
await browser.close();
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
