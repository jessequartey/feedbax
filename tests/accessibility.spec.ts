import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const feedback = {
  id: 'feedback-1',
  title: 'Offline mode',
  description: 'Let people review feedback without a network connection.',
  type: 'feature',
  author: { id: 'author-1', displayName: 'Ada' },
  status: {
    id: 'planned',
    name: 'Planned',
    order: 1,
    color: '#8b5cf6',
    isTerminal: false,
  },
  category: { id: 'feature', name: 'Feature', order: 0 },
  tags: [],
  voteCount: 8,
  commentCount: 2,
  createdAt: '2026-07-11T12:00:00Z',
  updatedAt: '2026-07-11T12:00:00Z',
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

async function mockFeedback(page: Page, items: unknown[] = []) {
  await page.route('**/api/vote-state', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  )
  await page.route(/\/api\/feedback(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, hasMore: false }),
    }),
  )
}

test('portal empty, search-empty, dark theme, and dialog are accessible', async ({
  page,
}) => {
  await mockFeedback(page)
  await page.goto('http://localhost:3000/')
  await expect(
    page.getByRole('heading', { name: 'No feedback yet' }),
  ).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('searchbox', { name: 'Search' }).fill('missing idea')
  await expect(
    page.getByRole('heading', { name: 'No feedback matches your search' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoAxeViolations(page)

  const opener = page.getByRole('button', { name: 'Create Feedback' }).first()
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Share an Idea' })
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel('Title')).toBeFocused()
  await expectNoAxeViolations(page)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('portal distinguishes connector, authentication, rate, permission, and unexpected failures', async ({
  page,
}) => {
  await page.goto('http://localhost:3000/')
  await expect(
    page.getByRole('heading', {
      name: 'The connected workspace is unavailable',
    }),
  ).toBeVisible()
  await expectNoAxeViolations(page)

  for (const failure of [
    {
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      heading: 'Sign in to continue',
      extra: { loginLocation: '/login' },
    },
    {
      status: 429,
      code: 'RATE_LIMITED',
      heading: 'Too many requests',
      extra: { retryAfterSeconds: 30 },
    },
    {
      status: 403,
      code: 'PERMISSION_DENIED',
      heading: 'You don’t have permission to do that',
      extra: {},
    },
    {
      status: 500,
      code: 'UNEXPECTED_ERROR',
      heading: 'We couldn’t complete that request',
      extra: {},
    },
  ]) {
    await page.unrouteAll({ behavior: 'wait' })
    await mockFeedback(page, [feedback])
    await page.route('**/api/vote', (route) =>
      route.fulfill({
        status: failure.status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: failure.code,
            message: 'This action could not be completed.',
            requestId: `request-${failure.status}`,
            retryable: failure.status === 429 || failure.status >= 500,
            ...failure.extra,
          },
        }),
      }),
    )
    await page.goto('http://localhost:3000/')
    await page.getByRole('button', { name: /Vote for Offline mode/ }).click()
    await expect(
      page.getByRole('heading', { name: failure.heading }),
    ).toBeVisible()
  }
  await expectNoAxeViolations(page)
})

test('portal not-found and reduced-motion views are accessible', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://localhost:3000/not-a-route')
  await expect(
    page.getByRole('heading', { name: 'This page isn’t available' }),
  ).toBeVisible()
  await expectNoAxeViolations(page)
})

test('site home and documentation search dialog are accessible', async ({
  page,
}) => {
  await page.goto('http://localhost:3001/')
  await expectNoAxeViolations(page)
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Search documentation' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Search Documentation' }),
  ).toBeVisible()
  await page.getByLabel('Search query').fill('configuration')
  await expect(page.getByRole('status')).toContainText('result')
  await expectNoAxeViolations(page)
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Search documentation' }),
  ).toBeFocused()
  await page.goto('http://localhost:3001/docs')
  await expectNoAxeViolations(page)
})
