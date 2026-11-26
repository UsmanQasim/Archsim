import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { loadTemplate, openApp } from './helpers'

// Serious and critical problems fail the build; the 3D canvas and the board's
// library-drawn internals are checked by their own labels instead.
async function audit(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).exclude('.pane-3d canvas').exclude('.react-flow__minimap').analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`)
}

for (const theme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems, ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await openApp(page)
    await loadTemplate(page, 'Classic 3-tier')
    if (theme === 'dark' && (await page.locator('html[data-theme=light]').count())) {
      await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
    }
    expect(await audit(page)).toEqual([])
    await page.locator('.react-flow__node', { hasText: 'API servers' }).first().click()
    expect(await audit(page)).toEqual([])
  })
}

test('welcome dialog is accessible', async ({ page }) => {
  await openApp(page, { welcome: true })
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await audit(page)).toEqual([])
})
