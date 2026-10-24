// End-to-end owner flow against the real backend. Reads the local demo password; never prints it.
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5175';
const slug = process.argv[2] ?? 'lin-mo';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../output/shots/flow');
await mkdir(out, { recursive: true });
const { password } = JSON.parse(await readFile(path.resolve(here, `../../server/data/creators/${slug}/demo-login.local.json`), 'utf8'));

const browser = await chromium.launch({ channel: 'msedge' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });
const step = (m) => console.log('·', m);

await page.goto(BASE + '/login');
await page.fill('input[autocomplete="username"]', slug);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/studio');
await page.waitForSelector('.studio-head h1');
step('logged in → studio: ' + await page.textContent('.studio-head h1'));
await shot('1-studio');

const marker = `流程测试 ${Date.now() % 100000}`;
const bio = page.locator('label.field', { hasText: '一句话简介' }).locator('input');
const original = await bio.inputValue();
await bio.fill(marker);
await page.click('.studio-actions .pill-signal');
await page.waitForSelector('.studio-status');
step('save status: ' + await page.textContent('.studio-status'));
await shot('2-saved');

await page.click('text=查看我的频道');
await page.waitForSelector('.station-bio');
step('channel bio: ' + await page.textContent('.station-bio'));
const ownerLink = await page.locator('text=编辑我的频道').count();
step('owner edit link visible: ' + ownerLink);

// other creator: no edit link, backend must refuse a forged PUT
await page.goto(BASE + '/chen-yu');
await page.waitForSelector('.station-bio');
step('edit link on other channel: ' + await page.locator('text=编辑我的频道').count());
const forged = await page.evaluate(async () => {
  const c = await (await fetch('/api/creators/chen-yu')).json();
  const r = await fetch('/api/creators/chen-yu', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: c.revision, profile: { ...c.profile, bio: 'hacked' }, works: c.works }) });
  return r.status;
});
step('forged PUT to other creator → ' + forged);

// restore
await page.goto(BASE + '/studio');
await page.waitForSelector('.studio-head h1');
await bio.fill(original);
await page.click('.studio-actions .pill-signal');
await page.waitForSelector('.studio-status');
step('restored: ' + await page.textContent('.studio-status'));

// Polyv picker
await page.click('text=添加保利威视频');
await page.waitForSelector('.picker');
await page.waitForTimeout(4000);
step('picker: ' + (await page.textContent('.picker-list')).slice(0, 160));
await shot('3-picker');

await browser.close();
if (errors.length) console.log('PAGE ERRORS', errors);
