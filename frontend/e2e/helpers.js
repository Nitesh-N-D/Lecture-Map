import { expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURE_PDF = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lecture.pdf')

export const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

export async function signUp(page, email = uniqueEmail(), password = 'e2e-password-123') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create account' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('E2E User')
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel(/Password/).fill(password)
  await dialog.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  return { email, password }
}

export async function uploadFixture(page) {
  if (new URL(page.url()).pathname === '/dashboard') {
    const add = page.getByRole('button', { name: 'Add lecture' })
    if (await add.isVisible()) await add.click()
  }
  await page.getByTestId('upload-input').first().setInputFiles(FIXTURE_PDF)
  await page.getByRole('button', { name: 'Build study materials' }).click()
}
