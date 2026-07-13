import { expect, test, type Page } from '@playwright/test'
import { SignJWT, base64url } from 'jose'
import { e2eAuth } from '../../playwright.e2e.config.js'

async function control(page: Page, action: 'reset' | 'fail' | 'recover') {
  const response = await page.request.post('/api/test-connector', {
    headers: { 'x-feedbax-test-key': 'feedbax-e2e-control' },
    data: { action },
  })
  expect(response.ok()).toBe(true)
}

async function signIn(page: Page, returnPath = '/') {
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    email: 'ada@example.test',
    name: 'Ada Tester',
    role: 'admin',
    return_path: returnPath,
  })
    .setProtectedHeader({ alg: 'HS256', kid: e2eAuth.keyId })
    .setIssuer(e2eAuth.issuer)
    .setAudience(e2eAuth.audience)
    .setSubject('e2e-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 120)
    .sign(base64url.decode(e2eAuth.handoffSecret))
  await page.goto(`/auth/handoff?token=${encodeURIComponent(token)}`)
  await expect(page).toHaveURL(returnPath)
  const session = await page.request.post('/api/auth-session')
  await expect(session.json()).resolves.toMatchObject({
    user: { displayName: 'Ada Tester' },
  })
}

const waitForHydration = (page: Page) =>
  page.locator('html[data-hydrated="true"]').waitFor()

test.beforeEach(async ({ page }) => {
  await control(page, 'reset')
})

test('anonymous visitors browse feedback, roadmap, and a linked changelog entry', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Share Your Product Feedback' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Offline mode' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Roadmap' }).first().click()
  await expect(
    page.getByRole('heading', { name: 'Product roadmap' }),
  ).toBeVisible()
  await expect(page.getByText('Offline mode')).toBeVisible()

  await page.getByRole('link', { name: 'Changelog' }).first().click()
  await page.getByRole('link', { name: /Feedback release links/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Feedback release links' }),
  ).toBeVisible()
  await expect(page.getByText('Linked changelog entries')).toBeVisible()
})

test('signed users receive duplicate suggestions, submit, vote, remove vote, and comment', async ({
  page,
}) => {
  await signIn(page)
  await waitForHydration(page)
  await page
    .locator('.board-heading')
    .getByRole('button', { name: 'Create Feedback' })
    .click()
  const form = page.getByRole('dialog', { name: 'Share an Idea' })
  await expect(form).toBeVisible()
  await form.getByLabel('Title').fill('Offline mode support')
  await expect(page.getByText('Similar feedback')).toBeVisible()
  await expect(page.getByRole('link', { name: /Offline mode/ })).toBeVisible()

  await form.getByLabel('Title').fill('Keyboard navigation audit')
  await form
    .getByLabel('Description')
    .fill('Audit the complete portal flow using only the keyboard.')
  await form.getByRole('button', { name: 'Submit feedback' }).click()
  await expect(
    page.getByRole('heading', { name: 'Keyboard navigation audit' }),
  ).toBeVisible()

  await page.goto('/')
  const vote = page.getByRole('button', { name: /Vote for Offline mode/ })
  await vote.click()
  await expect(vote).toHaveAttribute('aria-pressed', 'true')
  await vote.click()
  await expect(vote).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('link', { name: /Offline mode/ }).click()
  await waitForHydration(page)
  await page
    .getByLabel('Add a Comment')
    .fill('This is a synthetic E2E comment.')
  await page.getByRole('button', { name: 'Post Comment' }).click()
  await expect(page.getByText('This is a synthetic E2E comment.')).toBeVisible()
  await expect(page.locator('.action-message')).toContainText('Comment posted')
})

test('the portal recovers after a connector outage', async ({ page }) => {
  await control(page, 'fail')
  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      name: 'The connected workspace is unavailable',
    }),
  ).toBeVisible()
  await control(page, 'recover')
  await page.getByRole('button', { name: 'Try Again' }).click()
  await expect(
    page.getByRole('heading', { name: 'Offline mode' }),
  ).toBeVisible()
})
