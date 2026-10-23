// 设计评审截图：用本机 Edge 跑真实页面，输出到 ../.shots/<轮次>/
// 用法：node scripts/shots.mjs r3
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const round = process.argv[2] ?? 'latest'
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.shots', round)
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const settle = (page, ms = 1200) => page.waitForTimeout(ms)

async function run(name, viewport, steps) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 })
  const page = await ctx.newPage()
  try {
    await steps(page)
    await page.screenshot({ path: path.join(out, `${name}.png`) })
    console.log('ok', name)
  } catch (e) {
    console.log('FAIL', name, e.message.split('\n')[0])
  } finally {
    await ctx.close()
  }
}

const desk = { width: 1440, height: 900 }
const phone = { width: 390, height: 844 }
const firstOf = (page, sel) => page.locator(sel).first()

await run('1-home', desk, async (p) => { await p.goto(BASE + '/'); await settle(p) })
await run('2-wall', desk, async (p) => { await p.goto(BASE + '/liurunsen'); await settle(p) })
await run('3-wall-scrolled', desk, async (p) => {
  await p.goto(BASE + '/liurunsen'); await settle(p)
  await p.mouse.wheel(0, 1400); await settle(p, 1500)
})
await run('4-focus-poster', desk, async (p) => {
  await p.goto(BASE + '/liurunsen'); await settle(p)
  await firstOf(p, 'figure button').click(); await settle(p, 1500)
})
await run('5-focus-video', desk, async (p) => {
  await p.goto(BASE + '/liurunsen?type=video'); await settle(p)
  await firstOf(p, 'figure button').click(); await settle(p, 7000)
})
await run('6-phone-home', phone, async (p) => { await p.goto(BASE + '/'); await settle(p) })
await run('7-phone-wall', phone, async (p) => { await p.goto(BASE + '/liurunsen'); await settle(p) })
await run('8-phone-focus', phone, async (p) => {
  await p.goto(BASE + '/liurunsen'); await settle(p)
  await firstOf(p, 'figure button').click(); await settle(p, 1500)
})

await browser.close()
