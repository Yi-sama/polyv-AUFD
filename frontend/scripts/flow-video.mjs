// Real owner flow: pick a video from the shared Polyv library in Studio, add a highlight, save, then play it as a visitor.
// Usage: node scripts/flow-video.mjs <slug> <titleKeyword> <workTitle> <highlights "m:ss=名称,...">
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5175';
const [slug, keyword, workTitle, hl = ''] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../output/shots/flow'); await mkdir(out, { recursive: true });
const { password } = JSON.parse(await readFile(path.resolve(here, `../../server/data/creators/${slug}/demo-login.local.json`), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const log = (...a) => console.log('·', ...a);

await page.goto(BASE + '/login');
await page.fill('input[autocomplete="username"]', slug);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForSelector('.studio-head h1');
await page.click('text=添加保利威视频');
await page.waitForSelector('.picker');
await page.fill('.picker-search input', keyword);
await page.click('.picker-search button');
await page.waitForSelector('.picker-item:not([disabled])', { timeout: 20000 });
await page.screenshot({ path: path.join(out, 'video-1-picker.png') });
log('picker first:', await page.textContent('.picker-item .picker-title'));
await page.click('.picker-item:not([disabled])');
const editor = page.locator('.work-editor');
await editor.locator('label.field', { hasText: '标题' }).first().locator('input').fill(workTitle);
for (const pair of hl.split(',').filter(Boolean)) {
  const [time, name] = pair.split('=');
  await editor.locator('input[aria-label="片段时间"]').fill(time);
  await editor.locator('input[aria-label="片段名称"]').fill(name);
  await editor.locator('.hl-add .pill').click();
}
await page.screenshot({ path: path.join(out, 'video-2-editor.png') });
await page.click('.studio-actions .pill-signal');
await page.waitForSelector('.studio-status');
log('save:', await page.textContent('.studio-status'));
const work = await page.evaluate(async s => (await (await fetch(`/api/creators/${s}`)).json()).works[0], slug);
log('saved work:', work.title, work.videoId, 'cover', work.cover, 'duration', work.duration, 'highlights', JSON.stringify(work.highlights));

const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
visitor.on('pageerror', e => errors.push(e.message));
await visitor.goto(`${BASE}/${slug}/w/${work.id}`);
await visitor.waitForFunction(() => document.querySelector('.polyv-playback')?.textContent?.includes('已就绪') ||
  document.querySelector('.polyv-error'), null, { timeout: 45000 });
log('visitor player:', await visitor.textContent('.polyv-playback'), await visitor.locator('.polyv-error').count() ? await visitor.textContent('.polyv-error') : '');
const btn = visitor.locator('.polyv-highlight').last();
if (await btn.count()) {
  await btn.click();
  await visitor.waitForTimeout(2500);
  log('after highlight click:', await visitor.textContent('.polyv-playback'));
}
await visitor.screenshot({ path: path.join(out, 'video-3-visitor.png') });
await browser.close();
console.log(errors.length ? 'PAGE ERRORS ' + errors.join(' | ') : 'no page errors');
