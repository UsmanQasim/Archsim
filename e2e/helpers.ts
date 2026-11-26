import { expect, type Page } from '@playwright/test'

/** Open the app with the welcome dialog already dismissed and a fresh design. */
export async function openApp(page: Page, opts: { welcome?: boolean; hash?: string } = {}) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript((welcome) => {
    try {
      localStorage.clear()
      if (!welcome) localStorage.setItem('archsim:seen-help', '1')
    } catch {
      /* storage blocked */
    }
  }, !!opts.welcome)
  await page.goto('/' + (opts.hash ?? ''))
  await expect(page.locator('.topbar')).toBeVisible()
  return errors
}

export async function loadTemplate(page: Page, name: string) {
  const more = page.getByRole('button', { name: 'More' })
  if (await page.getByRole('button', { name: /^Templates/ }).isVisible()) {
    await page.getByRole('button', { name: /^Templates/ }).click()
  } else {
    await more.click()
    await page.getByRole('button', { name: 'Templates' }).click()
  }
  await page.locator('.menu-item', { hasText: name }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
}

/** The "succeed" number in the metrics strip, as a fraction. */
export async function successRate(page: Page) {
  const metric = page.locator('.metric').filter({ has: page.locator('.metric-label', { hasText: /^succeed/ }) })
  const txt = await metric.locator('.metric-value').innerText()
  return Number(txt.replace('%', '')) / 100
}
