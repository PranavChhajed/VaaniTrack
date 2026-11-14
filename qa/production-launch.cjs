// All API traffic is intercepted; never writes production transactions.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { seedScript } = require('./qa-lib.cjs');
const BASE = process.env.BASE || 'http://127.0.0.1:3201';
(async () => {
  const browser = await chromium.launch();
  try {
    for (const seed of ['fresh', 'ready']) for (const slow of [false, true]) for (const motion of ['reduce', 'no-preference']) {
      const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, reducedMotion: motion });
      await context.addInitScript(seedScript(seed, { device: '11111111-1111-4111-8111-111111111111' }));
      await context.route('**/api/**', r => r.fulfill({ status: 204, body: '' }));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      if (slow) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await context.route('**/*.js*', async r => { await new Promise(resolve => setTimeout(resolve, 300)); await r.continue(); });
      }
      await page.goto(BASE + '/app');
      const result = await page.evaluate(() => {
        // Recreate delayed hydration while the cold-launch marker is active.
        const wasCold = document.documentElement.hasAttribute('data-cold');
        document.documentElement.setAttribute('data-cold', '');
        const main = document.querySelector('main');
        const child = document.createElement('div'); main.append(child);
        const result = { childAnimation: getComputedStyle(child).animationName, transform: getComputedStyle(main).transform, animation: getComputedStyle(main).animationName };
        child.remove();
        if (!wasCold) document.documentElement.removeAttribute('data-cold');
        return result;
      });
      assert.equal(result.childAnimation, 'none');
      assert.equal(result.transform, 'none');
      if (motion === 'reduce') assert.equal(result.animation, 'none');
      await page.waitForTimeout(2100);
      assert.equal(await page.locator('html').getAttribute('data-cold'), null);
      if (seed === 'ready') {
        assert.equal(await page.locator('#first-run-veil').isVisible(), false);
        await page.getByRole('navigation', { name: 'Screens' }).getByText('Journal', { exact: true }).click();
        await page.waitForURL('**/journal');
        await page.reload(); assert.equal(new URL(page.url()).pathname, '/journal');
      } else {
        assert.equal(await page.getByRole('button', { name: /next/i }).count() > 0, true);
      }
      assert.deepEqual(errors, []);
      console.log('PASS', seed, slow ? 'throttled' : 'normal', motion);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
