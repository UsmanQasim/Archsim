import { expect, test } from '@playwright/test'
import { loadTemplate, openApp } from './helpers'

test.skip(({ isMobile }) => !isMobile, 'phone layout only')

test('phone: panels slide in and the menu holds the hidden controls', async ({ page }) => {
  await openApp(page)
  await loadTemplate(page, 'Classic 3-tier')
  // nothing spills off the side of the screen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: 'Components', exact: true }).click()
  await expect(page.locator('.palette')).toBeInViewport()
  const vw = page.viewportSize()!.width
  await page.locator('.scrim').click({ position: { x: vw - 12, y: 200 } })
  await page.locator('.react-flow__node', { hasText: 'API servers' }).first().click()
  await expect(page.locator('.inspector')).toBeInViewport()
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: /Create a challenge/ })).toBeVisible()
})
