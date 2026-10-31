import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import { FIXTURE_PDF, signUp, uniqueEmail, uploadFixture } from './helpers.js'

const axe = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])

async function openFirstLecture(page) {
  await uploadFixture(page)
  await expect(page).toHaveURL(/\/lectures\/[^/]+$/, { timeout: 30_000 })
}

test.describe('A. public site', () => {
  test('landing renders, is indexable, and has no serious a11y violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('study system')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0).catch(() => {})
    const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null)
    expect(robots ?? '').not.toContain('noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    const results = await axe(page).analyze()
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })

  test('unknown URL shows a noindex 404 page', async ({ page }) => {
    await page.goto('/definitely/not/here')
    await expect(page.getByRole('heading', { name: /does not exist/i })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('private routes redirect signed-out visitors', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).not.toHaveURL(/\/dashboard/)
  })
})

test.describe('B. guest session', () => {
  test('start as guest, see empty dashboard, sign out', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start as guest' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Your lectures' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/dashboard')
    await expect(page).not.toHaveURL(/\/dashboard/)
  })
})

test.describe('C. accounts', () => {
  test('signup, sign out, wrong password rejected, login works', async ({ page }) => {
    const { email, password } = await signUp(page)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel(/Password/).fill('wrong-password-999')
    await dialog.getByRole('button', { name: 'Sign in' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await dialog.getByLabel(/Password/).fill(password)
    await dialog.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('duplicate email signup is refused', async ({ page }) => {
    const { email } = await signUp(page)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Create account' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel(/Password/).fill('another-password-123')
    await dialog.getByRole('button', { name: 'Create account' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(page).not.toHaveURL(/\/dashboard/)
  })

  test('Escape closes the auth dialog', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create account' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').focus()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})

test.describe('D. upload to study', () => {
  test('PDF upload is processed and its concepts can be studied', async ({ page }) => {
    await signUp(page)
    await page.goto('/dashboard')
    await openFirstLecture(page)

    // The pipeline runs in-process with the extractive fallback (no Gemini here).
    await page.getByRole('tab', { name: 'Concepts' }).click()
    const list = page.getByRole('list', { name: 'Concept list' })
    await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 45_000 })
    const count = await list.getByRole('listitem').count()
    expect(count).toBeGreaterThan(0)
    await expect(list.getByText('Not studied').first()).toBeVisible()

    // Viewing a concept must not mark it studied.
    await list.getByRole('button').first().click()
    await expect(page.getByRole('button', { name: 'Mark as studied' })).toBeVisible()
    await expect(list.getByText('✓ Studied')).toHaveCount(0)

    await page.getByRole('button', { name: 'Mark as studied' }).click()
    await expect(list.getByText('✓ Studied').first()).toBeVisible()

    // The state survives a reload (persisted server-side).
    await page.reload()
    await page.getByRole('tab', { name: 'Concepts' }).click()
    await expect(page.getByRole('list', { name: 'Concept list' }).getByText('✓ Studied').first()).toBeVisible({ timeout: 20_000 })
  })

  test('graph tab exposes node status in accessible labels', async ({ page }) => {
    await signUp(page)
    await openFirstLecture(page)
    const node = page.locator('svg [aria-label*="not studied"]').first()
    await expect(node).toBeAttached({ timeout: 45_000 })
  })

  test('flashcards tab shows generated cards', async ({ page }) => {
    await signUp(page)
    await openFirstLecture(page)
    await page.getByRole('tab', { name: 'Flashcards' }).click()
    await expect(page.getByText(/No flashcards yet/)).toHaveCount(0, { timeout: 45_000 })
  })

  test('lecture page has no serious a11y violations', async ({ page }) => {
    await signUp(page)
    await openFirstLecture(page)
    await page.getByRole('tab', { name: 'Concepts' }).click()
    await expect(page.getByRole('list', { name: 'Concept list' })).toBeVisible({ timeout: 45_000 })
    const results = await axe(page).analyze()
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
})

test.describe('E. upload validation', () => {
  test('a file that is not really a PDF is rejected with a message', async ({ page }) => {
    await signUp(page)
    await page.getByRole('button', { name: 'Add lecture' }).click()
    await page.getByTestId('upload-input').first().setInputFiles({
      name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf'),
    })
    await page.getByRole('button', { name: 'Build study materials' }).click()
    await expect(page.getByText(/valid|pdf|supported|invalid/i).first()).toBeVisible()
    await expect(page).not.toHaveURL(/\/lectures\//)
  })
})

test.describe('F. privacy controls', () => {
  test('export downloads own data, deletion removes the account', async ({ page }) => {
    const { email, password } = await signUp(page)
    await page.goto('/settings')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download my data' }).click(),
    ])
    const body = JSON.parse(fs.readFileSync(await download.path(), 'utf8'))
    expect(JSON.stringify(body)).toContain(email)

    await page.getByLabel('Current password').fill(password)
    await page.getByLabel(/type DELETE/i).fill('DELETE')
    await page.getByRole('button', { name: 'Delete my account' }).click()
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })

    await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel(/Password/).fill(password)
    await dialog.getByRole('button', { name: 'Sign in' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
  })
})

test.describe('G. keyboard and focus', () => {
  test('skip link is the first tab stop and moves focus to main', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })

  test('upload zone opens the file chooser from the keyboard', async ({ page }) => {
    await page.goto('/')
    const zone = page.getByRole('button', { name: /Choose an audio, video or PDF file/ })
    await zone.focus()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
    await chooser.setFiles(FIXTURE_PDF)
    await expect(page.getByText('lecture.pdf').first()).toBeVisible()
  })
})

test.describe('H. Google sign-in start', () => {
  test('redirects to Google with PKCE, state and nonce (IdP request is intercepted)', async ({ page }) => {
    let googleUrl = null
    page.on('request', (req) => {
      if (!googleUrl && req.url().startsWith('https://accounts.google.com/o/oauth2/')) googleUrl = req.url()
    })
    // Never contact Google from the test run.
    await page.route('https://accounts.google.com/**', (route) => route.abort())
    await page.goto('/')
    await page.getByRole('button', { name: 'Create account' }).first().click()
    await page.getByRole('button', { name: /google/i }).click()
    await expect.poll(() => googleUrl, { timeout: 15_000 }).not.toBeNull()
    const url = new URL(googleUrl)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8010/auth/google/callback')
  })

  test('callback error code returns to the landing page with a message', async ({ page }) => {
    await page.goto('/?auth_error=google_oauth_failed')
    await expect(page.getByRole('alert')).toContainText(/Google sign-in could not be completed/)
  })

  test('success fragment with a bad token is rejected and the hash is cleared', async ({ page }) => {
    await page.goto('/auth/success#token=not-a-real-token')
    await expect(page).toHaveURL(/auth_error=/, { timeout: 15_000 })
    expect(new URL(page.url()).hash).toBe('')
  })
})

test.describe('I. mobile @mobile', () => {
  test('landing does not scroll sideways and concepts are reachable', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await signUp(page, uniqueEmail())
    await openFirstLecture(page)
    await page.getByRole('tab', { name: 'Concepts' }).click()
    await expect(page.getByRole('list', { name: 'Concept list' }).getByRole('listitem').first()).toBeVisible({ timeout: 45_000 })
  })
})

test.describe('K. appearance, Gemini key help and Aha Path controls', () => {
  test('theme choice persists across reloads and the key steps are shown', async ({ page }) => {
    await signUp(page)
    await page.goto('/settings')
    await page.getByRole('radio', { name: /Dark/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('radio', { name: /Dark/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('heading', { name: 'Your Gemini key' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Google AI Studio/ })).toHaveAttribute('href', 'https://aistudio.google.com/apikey')
    await expect(page.getByRole('button', { name: 'Save key' })).toBeDisabled()
  })

  test('Aha Path can be paused, resumed, skipped and stopped', async ({ page }) => {
    await signUp(page)
    await openFirstLecture(page)
    await page.getByRole('tab', { name: 'Graph' }).click()
    await page.getByRole('button', { name: /Aha Path/ }).click({ timeout: 45_000 })
    const group = page.getByRole('group', { name: 'Aha Path controls' })
    await expect(group.getByRole('button', { name: /Pause \(1\// })).toBeVisible()
    await group.getByRole('button', { name: /Pause/ }).click()
    await expect(group.getByRole('button', { name: /Resume \(1\// })).toBeVisible()
    await page.waitForTimeout(1800) // paused: must not advance
    await expect(group.getByRole('button', { name: /Resume \(1\// })).toBeVisible()
    await group.getByRole('button', { name: 'Next concept' }).click()
    await expect(group.getByRole('button', { name: /Resume \(2\// })).toBeVisible()
    await group.getByRole('button', { name: 'Previous concept' }).click()
    await expect(group.getByRole('button', { name: /Resume \(1\// })).toBeVisible()
    await group.getByRole('button', { name: /Resume/ }).click()
    await expect(group.getByRole('button', { name: /Pause \(2\// })).toBeVisible({ timeout: 5000 })
    await group.getByRole('button', { name: 'Stop tour' }).click()
    await expect(page.getByRole('button', { name: /Aha Path/ })).toBeVisible()
  })
})

test.describe('L. study path @mobile', () => {
  test('a path can be started, paused, restored after reload and completed', async ({ page }) => {
    await signUp(page)
    await openFirstLecture(page)
    // Wait for processing to finish so the graph has concepts.
    await page.getByRole('tab', { name: 'Concepts' }).click()
    await expect(page.getByRole('list', { name: 'Concept list' }).getByRole('listitem').first()).toBeVisible({ timeout: 45_000 })
    const lecturePath = new URL(page.url()).pathname
    await page.goto(`${lecturePath}/study-path`)

    const select = page.getByLabel('Target concept')
    await expect(select.locator('option').nth(1)).toBeAttached({ timeout: 20_000 })
    const target = await select.locator('option').last().getAttribute('value')
    await select.selectOption(target)
    await page.getByRole('button', { name: 'Start path' }).click()
    await expect(page).toHaveURL(new RegExp(`target=${encodeURIComponent(target)}`))

    const summary = page.getByText(/^0 of \d+ steps? complete/)
    await expect(summary).toBeVisible()
    const total = Number((await summary.textContent()).match(/of (\d+)/)[1])
    await expect(page.getByLabel('Current step')).toBeVisible()

    // Pause survives a reload; the target is restored from saved progress (no query string).
    await page.getByRole('button', { name: /Pause/ }).click()
    await expect(page.getByText(/Path paused/)).toBeVisible()
    await page.goto(`${lecturePath}/study-path`)
    await expect(page.getByText(/^0 of \d+ steps? complete · paused/)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Resume/ }).click()

    // Complete every step; completion is stored on the server.
    for (let done = 1; done <= total; done++) {
      await page.getByLabel('Current step').getByRole('button', { name: /Complete/ }).click()
      if (done < total) await expect(page.getByText(new RegExp(`^${done} of ${total} steps? complete`))).toBeVisible()
    }
    await expect(page.getByText('Path complete.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Path complete.')).toBeVisible({ timeout: 20_000 })

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
