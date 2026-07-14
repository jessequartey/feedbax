import { expect, test } from '@playwright/test'
import { SignJWT, base64url } from 'jose'
import { e2eAuth } from '../../playwright.e2e.config.js'

const required = [
  'NOTION_TOKEN',
  'NOTION_DATA_SOURCE_ID',
  'NOTION_VOTES_DATA_SOURCE_ID',
  'NOTION_COMMENTS_DATA_SOURCE_ID',
  'FEEDBAX_INTERACTION_HASH_KEY',
] as const
const configured = required.every((name) => Boolean(process.env[name]))
const prefix = '[feedbax-smoke]'

async function notion(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'notion-version': '2025-09-03',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok)
    throw new Error(`Notion cleanup failed with ${response.status}.`)
  return response.json() as Promise<Record<string, unknown>>
}

async function query(dataSourceId: string, filter: unknown) {
  const value = await notion(`/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    body: JSON.stringify({ page_size: 100, filter }),
  })
  return (value.results ?? []) as Array<{ id: string }>
}

async function archive(id: string) {
  await notion(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  })
}

async function cleanup() {
  if (!configured) return
  const feedback = await query(process.env.NOTION_DATA_SOURCE_ID!, {
    property: 'Name',
    title: { contains: prefix },
  })
  for (const page of feedback) {
    for (const source of [
      process.env.NOTION_VOTES_DATA_SOURCE_ID!,
      process.env.NOTION_COMMENTS_DATA_SOURCE_ID!,
    ]) {
      const related = await query(source, {
        property: 'Feedback',
        relation: { contains: page.id },
      })
      for (const row of related) await archive(row.id)
    }
    await archive(page.id)
  }
}

test.describe('Notion connector smoke', () => {
  test.skip(!configured, 'Notion smoke credentials are not configured.')
  test.beforeAll(cleanup)
  test.afterAll(cleanup)

  test('browses, submits, votes, removes a vote, and comments', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({
      email: 'notion-smoke@example.test',
      name: 'Notion Smoke',
      return_path: '/',
    })
      .setProtectedHeader({ alg: 'HS256', kid: e2eAuth.keyId })
      .setIssuer(e2eAuth.issuer)
      .setAudience(e2eAuth.audience)
      .setSubject(`notion-smoke-user-${now}`)
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(base64url.decode(e2eAuth.handoffSecret))
    await page.goto(`/auth/handoff?token=${encodeURIComponent(token)}`)
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: 'Share Your Product Feedback' }),
    ).toBeVisible()
    // The heading is server-rendered. Wait for the application marker rather
    // than network idleness before exercising React event handlers.
    await page.locator('html[data-hydrated="true"]').waitFor()

    const title = `${prefix} ${Date.now()}`
    await page
      .locator('.board-heading')
      .getByRole('button', { name: 'Create Feedback' })
      .click()
    const form = page.getByRole('dialog', { name: 'Share an Idea' })
    await expect(form).toBeVisible()
    await form.getByLabel('Title').fill(title)
    await page
      .getByRole('dialog', { name: 'Share an Idea' })
      .getByLabel('Description')
      .fill('Synthetic live connector smoke fixture; safe to archive.')
    const submitResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/feedback' &&
        response.request().method() === 'POST',
    )
    await form.getByRole('button', { name: 'Submit feedback' }).click()
    const response = await submitResponse
    expect(response.status()).toBe(200)

    // Assert against Notion directly before exercising the persisted record.
    // The optimistic board row can be replaced while the mutation settles.
    await expect
      .poll(
        async () =>
          (
            await query(process.env.NOTION_DATA_SOURCE_ID!, {
              property: 'Name',
              title: { equals: title },
            })
          ).length,
        { timeout: 60_000 },
      )
      .toBe(1)
    await page.goto('/?sort=recent')
    await page.locator('html[data-hydrated="true"]').waitFor()
    await expect(page.getByRole('link', { name: title })).toBeVisible({
      timeout: 30_000,
    })

    const vote = page.getByRole('button', {
      name: `Vote for ${title}`,
    })
    await vote.click()
    await expect(vote).toHaveAttribute('aria-pressed', 'true')
    await vote.click()
    await expect(vote).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('link', { name: title }).click()
    await page.locator('html[data-hydrated="true"]').waitFor()
    await page.getByLabel('Add a Comment').fill('Synthetic smoke comment.')
    await page.getByRole('button', { name: 'Post Comment' }).click()
    await expect(page.getByText('Synthetic smoke comment.')).toBeVisible()
  })
})
