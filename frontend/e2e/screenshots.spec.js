import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import { signUp, uploadFixture } from './helpers.js'

// Visual QA only: run with SHOTS=1. Writes to .cache/shots/auth-<theme>-<viewport>-<page>.png
test.skip(!process.env.SHOTS, 'screenshot QA runs only with SHOTS=1')
test.setTimeout(1_200_000)

const VIEWPORTS = [
  ['xs-320', 320, 568],
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['land-1024', 1024, 768],
  ['laptop-1280', 1280, 720],
  ['desktop-1440', 1440, 900],
  ['wide-1920', 1920, 1080],
]
const OUT = '.cache/shots'

test('logged-in pages in both themes', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await signUp(page)
  await uploadFixture(page)
  await expect(page).toHaveURL(/\/lectures\/[^/]+$/, { timeout: 30_000 })
  await page.getByRole('tab', { name: 'Concepts' }).click()
  await expect(page.getByRole('list', { name: 'Concept list' }).getByRole('listitem').first()).toBeVisible({ timeout: 45_000 })
  const lectureUrl = page.url()
  const token = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))
  await ctx.close()

  const pages = [
    ['dashboard', '/dashboard'],
    ['lecture-graph', lectureUrl, 'Graph'],
    ['lecture-concepts', lectureUrl, 'Concepts'],
    ['lecture-flashcards', lectureUrl, 'Flashcards'],
    ['lecture-insights', lectureUrl, 'Insights'],
    ['lecture-transcript', lectureUrl, 'Transcript'],
    ['study-path', lectureUrl + '/study-path'],
    ['review', '/review'],
    ['knowledge-map', '/knowledge-map'],
    ['settings', '/settings'],
  ]
  for (const theme of ['light', 'dark']) {
    for (const [vp, w, h] of VIEWPORTS) {
      const c = await browser.newContext({ viewport: { width: w, height: h } })
      await c.addInitScript(([t, store]) => {
        localStorage.setItem('lecturemap-theme', t)
        for (const [k, v] of Object.entries(JSON.parse(store))) if (k !== 'lecturemap-theme') localStorage.setItem(k, v)
      }, [theme, token])
      const p = await c.newPage()
      for (const [name, url, tab] of pages) {
        await p.goto(url.startsWith('http') ? url : url)
        await p.waitForTimeout(500)
        if (tab) {
          await p.getByRole('tab', { name: tab }).click().catch(() => {})
          await p.waitForTimeout(400)
        }
        await p.screenshot({ path: `${OUT}/auth-${theme}-${vp}-${name}.png`, fullPage: true })
        const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).analyze()
        const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (sideways > 1) {
          const culprits = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 5).map((e) => e.tagName + '.' + String(e.className).slice(0, 60) + ' r=' + Math.round(e.getBoundingClientRect().right)))
          console.log('  OVERFLOW', name, culprits)
        }
        console.log(`${theme} ${vp} ${name} url=${new URL(p.url()).pathname} overflowX=${sideways}`, r.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target}`))
      }
      await c.close()
    }
  }
})
