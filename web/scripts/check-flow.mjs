// 功能检查：长廊滚动、筛选、聚焦→关闭回到原位、键盘切换。node scripts/check-flow.mjs
import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const lefts = () =>
  page.$$eval('figure', (fs) => fs.map((f) => [f.id.slice(5), Math.round(f.querySelector('button div').getBoundingClientRect().left)]))
const check = (name, ok, info = '') => console.log(ok ? 'PASS' : 'FAIL', name, info)

await page.goto(BASE + '/liurunsen?mock')
await page.waitForTimeout(1200)
const before = await lefts()
await page.mouse.wheel(0, 700)
await page.waitForTimeout(800)
const after = await lefts()
check('滚动推动长廊横移', after[0][1] < before[0][1], JSON.stringify({ before: before[0], after: after[0] }))
const counter = await page.textContent('section .label-num.text-sm')
check('进度计数更新', counter?.trim() !== '01 / 04', counter)

// 打开最后一件，← 切到上一件，Esc 关闭：作品回到视野内，焦点回到它
const last = after.at(-1)[0]
await page.click(`#work-${last}`)
await page.waitForTimeout(900)
check('打开聚焦', new URL(page.url()).pathname === `/liurunsen/${last}`, page.url())
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(600)
const prevId = new URL(page.url()).pathname.split('/').pop()
await page.keyboard.press('Escape')
await page.waitForTimeout(1200)
const box = await page.$eval(`#work-${prevId}`, (el) => {
  const b = el.getBoundingClientRect()
  return { left: Math.round(b.left), right: Math.round(b.right), focused: document.activeElement === el }
})
check('关闭后作品在视野内且获得焦点', box.left >= 0 && box.right <= 1440 && box.focused, JSON.stringify({ prevId, ...box }))
check('关闭后 URL 回到展墙', new URL(page.url()).pathname === '/liurunsen', page.url())

// 筛选
await page.click('[aria-label="按类型筛选"] >> text=影像')
await page.waitForTimeout(1200)
const filtered = await lefts()
check('筛选后只剩影像', filtered.length === 1 && page.url().includes('type=video'), JSON.stringify(filtered))
check('筛选后长廊回到起点', (await page.evaluate(() => scrollY)) < 5)

check('无运行时错误', errors.length === 0, errors.join(' | '))
await browser.close()
