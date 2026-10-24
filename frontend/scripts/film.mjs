// Records the demo film: real app + caption overlay. Output: ../../video/
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const BASE = 'http://127.0.0.1:5175';
const { password } = JSON.parse(await readFile(new URL('../../server/data/creators/he-tian/demo-login.local.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  window.__ov = (html, full) => {
    let el = document.getElementById('__ov');
    if (!el) { el = document.createElement('div'); el.id = '__ov'; document.documentElement.appendChild(el); }
    el.style.cssText = full
      ? 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#0e0f11;color:#f1eee6;font:600 22px/1.7 "Microsoft YaHei UI",sans-serif;text-align:center;padding:80px'
      : 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;background:rgba(0,0,0,.78);color:#fff;font:600 22px/1.5 "Microsoft YaHei UI",sans-serif;padding:10px 22px;border-radius:10px;max-width:90%;text-align:center';
    el.innerHTML = html; el.hidden = !html;
  };
});
const page = await ctx.newPage();
// Capture only this page's own frames via CDP screencast (never the desktop).
const { mkdirSync, writeFileSync } = await import('node:fs');
const FR = new URL('../../video/frames/', import.meta.url); mkdirSync(FR, { recursive: true });
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async f => {
  const name = `f${String(frames.length).padStart(5, '0')}.jpg`;
  writeFileSync(new URL(name, FR), Buffer.from(f.data, 'base64'));
  frames.push({ name, t: f.metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
const w = ms => page.waitForTimeout(ms);
const card = async (k, t, ms = 4200) => { await page.evaluate(([k, t]) => window.__ov(`<div><div style="color:#ff4d2e;font-size:20px;letter-spacing:.2em">${k}</div><div style="font-size:40px;margin:14px 0">${t[0]}</div><div style="color:#a3a098;font-size:22px">${t[1]}</div></div>`, true), [k, t]); await w(ms); };
const cap = t => page.evaluate(t => window.__ov(t, false), t);

await page.goto(BASE + '/'); await page.waitForSelector('.epg-row'); await w(1500);
await card('AUFD · 大咖作品频道', ['作品是什么', '收录保利威大咖的作品集平台：每一位大咖，都是一个频道']);
await card('WHY', ['为什么想做', '大咖有海报、照片、直播与课程视频，却散落在文件夹和后台里，<br>没有一个能代表自己、能一键分享的作品集']);
await cap('实现效果 ① 节目表：悬停即预览这个频道的作品');
for (const i of [1, 2, 4, 5]) { await page.hover(`.epg-list li:nth-child(${i}) .epg-row`); await w(1100); }
await cap('② 进入频道：正在播出的代表作 + 一键分享');
await page.click('.epg-list li:nth-child(4) .epg-row'); await w(2500);
await cap('③ 像换台一样切换大咖（← →）');
await page.keyboard.press('ArrowRight'); await w(1800); await page.keyboard.press('ArrowRight'); await w(1800);
await cap('④ 打开作品：大图浏览，关闭后回到原位');
await page.mouse.wheel(0, 700); await w(800);
await page.click('.wall-item:nth-child(2) .wall-link'); await w(2200); await page.keyboard.press('Escape'); await w(1200);
await cap('⑤ 刷台：像刷短视频一样刷大咖');
await page.goto(BASE + '/tune'); await w(1500);
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await w(1300); }
await cap('⑥ 大咖登录后台：只能编辑自己的频道');
await page.goto(BASE + '/login'); await page.fill('input[autocomplete="username"]', 'he-tian'); await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]'); await page.waitForSelector('.studio-head h1'); await w(1800);
await cap('⑦ 视频已在保利威：从保利威视频库直接选入（保利威 API）');
await page.click('text=添加保利威视频'); await page.waitForSelector('.picker-item', { timeout: 20000 }); await w(2600);
await page.click('.picker .icon-btn'); await w(500);
await cap('⑧ 访客打开链接：保利威播放器播放，点击精彩片段直接跳转（保利威 SDK）');
const work = await page.evaluate(async () => (await (await fetch('/api/creators/he-tian')).json()).works.find(x => x.type === 'video'));
await page.goto(`${BASE}/he-tian/w/${work.id}`);
await page.waitForFunction(() => document.querySelector('.polyv-playback')?.textContent?.includes('已就绪'), null, { timeout: 40000 }).catch(() => {});
await w(1200); await page.locator('.polyv-highlight').first().click().catch(() => {}); await w(4000);
await card('VALUE', ['有什么价值', '大咖：不用重复上传，保利威里的视频直接成为作品<br>主办方与合作方：一个链接看清这个人做过什么、讲得怎么样']);
await card('NEXT', ['下一步', '直播回放自动入库 · 每位大咖绑定自己的保利威账号<br>访问数据与合作邀约 · 更多频道模板']);
await card('SY Panel · 保利威黑客松', ['AUFD', '作品，不该只躺在文件夹里'], 3500);
await cdp.send('Page.stopScreencast').catch(() => {});
const lines = [];
frames.push({ name: frames.at(-1).name, t: frames.at(-1).t + 0.5 });
for (let i = 0; i < frames.length - 1; i++) lines.push(`file '${frames[i].name}'`, `duration ${Math.max(0.01, frames[i + 1].t - frames[i].t).toFixed(3)}`);
lines.push(`file '${frames.at(-1).name}'`);
writeFileSync(new URL('list.txt', FR), lines.join(String.fromCharCode(10)));
console.log('frames', frames.length);
await ctx.close(); await browser.close();
console.log('done');
