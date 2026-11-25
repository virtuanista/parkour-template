import { expect, test, type Page } from '@playwright/test';
interface S { variant: string; pos: { x: number; y: number; z: number }; state: string; done: boolean; time: number; actions: string[] }
const sessions = (p: Page) => p.evaluate(() => (window as unknown as { __parkour: { sessions: S[] } }).__parkour.sessions) as Promise<S[]>;
let errors: string[];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
});
test.afterEach(() => expect(errors).toEqual([]));

test('menú y cambio de variante', async ({ page }) => {
  await page.goto('/?variant=A');
  await expect(page.locator('#assigned')).toContainText('A');
  await page.getByLabel(/B, fluida/).check();
  await expect(page.locator('#assigned')).toContainText('B');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/menu.png' });
});
for (const v of ['A', 'B']) test(`juego con teclado real, variante ${v}`, async ({ page }) => {
  await page.goto(`/?variant=${v}`);
  await page.getByRole('button', { name: 'Jugar' }).click();
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  if (v === 'A') { await page.waitForFunction(() => (window as any).__parkour.sessions[0].pos.z < -4.6); await page.keyboard.press('Space', { delay: 80 }); }
  await page.waitForFunction(() => (window as any).__parkour.sessions[0].actions.includes('vault'), null, { timeout: 15000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `test-results/vault-${v}.png` });
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await sessions(page))[0].pos.z).toBeCloseTo(6, 0);
  await page.keyboard.press('Tab'); await expect(page.locator('#menu')).toBeVisible();
});
test('comparación A/B completa el circuito', async ({ page }) => {
  await page.goto('/?mode=ab');
  for (const st of ['slide', 'mantle', 'wallrun', 'grab', 'climb']) {
    await page.waitForFunction(s => (window as any).__parkour.sessions[1].actions.includes(s), st, { timeout: 60000 });
    await page.waitForTimeout(st === 'wallrun' ? 350 : 220);
    await page.screenshot({ path: `test-results/ab-${st}.png` });
  }
  await expect(page.locator('#result')).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: 'test-results/ab-fin.png' });
  for (const s of await sessions(page)) for (const a of ['vault', 'slide', 'mantle', 'wallrun', 'walljump', 'grab', 'climb', 'roll']) expect(s.actions).toContain(a);
});
test('móvil sin desbordamiento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/movil.png' });
});
