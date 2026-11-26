import { expect, test } from '@playwright/test'
import LZString from 'lz-string'
import { loadTemplate, openApp, successRate } from './helpers'

test('first visit shows the welcome dialog, then the board', async ({ page }) => {
  const errors = await openApp(page, { welcome: true })
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Start building' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(errors).toEqual([])
})

test('a template runs and every user request succeeds', async ({ page }) => {
  await openApp(page)
  await loadTemplate(page, 'Classic 3-tier')
  await expect.poll(() => successRate(page)).toBeGreaterThan(0.99)
  await expect(page.locator('.metric', { hasText: 'requests per second' }).locator('.metric-value')).not.toHaveText('0')
})

test('clicking a component opens its details and edits change the numbers', async ({ page }) => {
  await openApp(page)
  await loadTemplate(page, 'Classic 3-tier')
  await page.locator('.react-flow__node', { hasText: 'Users' }).first().click()
  await expect(page.locator('.inspector')).toContainText('Configuration')
  const users = page.locator('.inspector input[type=number]').first()
  await users.fill('5000000')
  await users.blur()
  await expect.poll(() => successRate(page), { timeout: 15_000 }).toBeLessThan(0.99)
})

test('sticky notes can be written and dragged by their top strip', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('1')
  await page.getByRole('button', { name: 'Add note' }).click()
  await page.locator('.note-text').first().fill('Reads can be stale')
  await page.waitForTimeout(600) // let the board finish re-framing before measuring
  const node = page.locator('.react-flow__node-note').first()
  const before = (await node.boundingBox())!
  const grip = (await page.locator('.note-grip').first().boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 10, grip.y + grip.height / 2 + 5, { steps: 3 })
  await page.waitForTimeout(100)
  await page.mouse.move(grip.x + 300, grip.y + 200, { steps: 20 })
  await page.waitForTimeout(100)
  await page.mouse.up()
  await page.waitForTimeout(200)
  const after = (await node.boundingBox())!
  expect(after.x - before.x).toBeGreaterThan(150)
  await expect(page.locator('.note-text').first()).toHaveValue('Reads can be stale')
})

test('losing a region fails requests, and bringing it back recovers', async ({ page }) => {
  await openApp(page)
  await loadTemplate(page, 'Global read-heavy')
  await page.getByRole('tab', { name: /^Chaos/ }).click()
  await page.locator('.chaos button', { hasText: 'N. Virginia' }).click()
  await expect.poll(() => successRate(page)).toBeLessThan(0.99)
  await page.locator('.chaos button', { hasText: 'N. Virginia' }).click()
  await expect.poll(() => successRate(page)).toBeGreaterThan(0.99)
})

test('the 3D model and the world map open', async ({ page }) => {
  await openApp(page)
  await loadTemplate(page, 'Global read-heavy')
  await page.getByRole('button', { name: 'Model', exact: true }).click()
  await expect(page.locator('.pane-3d canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.map-region')).toHaveCount(2)
  await expect(page.locator('.map-user')).toHaveCount(3)
})

test('the 12-month growth plan gives a verdict', async ({ page }) => {
  await openApp(page)
  await loadTemplate(page, 'Classic 3-tier')
  await page.getByRole('tab', { name: /^Stress/ }).click()
  await page.getByRole('button', { name: 'The next 12 months' }).click()
  await page.getByRole('button', { name: 'Plan the next 12 months' }).click()
  await expect(page.locator('.limit-verdict')).toBeVisible()
})

test('a guided solution walks through its steps', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: /^Problems/ }).click()
  await page.locator('.ptable tr', { hasText: 'URL Shortener' }).first().getByRole('button', { name: 'Solution' }).click()
  const next = page.getByRole('button', { name: /^Next/ }).first()
  await expect(next).toBeVisible()
  await next.click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
})

test('a practice session runs and ends with a summary', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: /^Practice/ }).click()
  await page.getByRole('button', { name: 'Start the clock' }).click()
  await expect(page.locator('.timer-pill')).toBeVisible()
  await page.locator('.practice-text').fill('Read-heavy, 100:1')
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByText(/Session done/)).toBeVisible()
})

test('a share link opens the design it holds', async ({ page }) => {
  const design = {
    v: 1, title: 'Shared from a test', challengeId: null,
    nodes: [
      { id: 'u', p: [0, 0], d: { kind: 'client', label: 'Test users', config: { region: 'city-london', users: 20000 } } },
      { id: 'a', p: [240, 0], d: { kind: 'app', label: 'Test API', config: { region: 'eu-west-1' } } },
    ],
    edges: [{ id: 'e', s: 'u', t: 'a' }],
  }
  await openApp(page, { hash: '#g=' + LZString.compressToEncodedURIComponent(JSON.stringify(design)) })
  await expect(page.locator('.react-flow__node', { hasText: 'Test API' })).toBeVisible()
})

test('the problem bank filters problems and starts one', async ({ page }) => {
  const errors = await openApp(page)
  await page.getByRole('button', { name: /^Problems/ }).click()
  const dlg = page.getByRole('dialog', { name: 'Problems and lessons' })
  await expect(dlg).toBeVisible()
  expect(await dlg.locator('.ptable tbody tr').count()).toBeGreaterThanOrEqual(50)
  await dlg.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' }).click()
  await dlg.getByRole('textbox', { name: 'Search problems' }).fill('bank ledger')
  await expect(dlg.locator('.ptable tbody tr')).toHaveCount(1)
  await dlg.getByRole('button', { name: 'Solve' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.locator('.dock')).toContainText('Send to interviewer')
  expect(errors).toEqual([])
})

test('a lesson checks the task live and moves on', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: /^Problems/ }).click()
  await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Learn' }).click()
  await page.locator('.lesson-grid li').first().getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('.lesson-main')).toBeVisible()
  await page.locator('.lesson-main').getByRole('button', { name: /^(Next|Skip)$/ }).click()
  await expect(page.locator('.lesson-steps li.on')).not.toHaveText(/^$/)
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
})

test('an interviewer saves a challenge from the board and a candidate opens its link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openApp(page)
  await loadTemplate(page, 'Classic 3-tier')
  await page.getByRole('button', { name: /^Problems/ }).click()
  await page.getByRole('tab', { name: 'Create a challenge' }).click()
  const dlg = page.getByRole('dialog', { name: 'Problems and lessons' })
  await dlg.getByPlaceholder('Design a URL shortener').fill('Team wiki')
  await dlg.getByRole('button', { name: /Capture the board as step 1/ }).click()
  await dlg.getByRole('button', { name: 'Set targets from the reference answer' }).click()
  await dlg.getByRole('button', { name: 'Test the reference answer' }).click()
  await expect(dlg.locator('.ed-test')).toContainText('p99 latency')
  await dlg.getByRole('button', { name: 'Save to my problems' }).click()
  await dlg.getByRole('tab', { name: 'Problems' }).click()
  await dlg.getByRole('textbox', { name: 'Search problems' }).fill('Team wiki')
  await expect(dlg.locator('.ptable tbody tr')).toHaveCount(1)
  const spec = await page.evaluate(() => JSON.parse(localStorage.getItem('archsim:custom') ?? '[]')[0])
  const link = '#c=' + LZString.compressToEncodedURIComponent(JSON.stringify({ ...spec, id: 'shared-wiki' }))
  const fresh = await context.newPage()
  await openApp(fresh, { hash: link })
  await expect(fresh.locator('.dock')).toContainText('Team wiki')
})
