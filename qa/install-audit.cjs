// Read-only Chrome diagnostics; app API requests are blocked.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'https://vaanitrack.vercel.app';
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/api/**', r => r.fulfill({ status: 204 }));
    await page.goto(BASE + '/app');
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    const manifest = await cdp.send('Page.getAppManifest');
    assert.deepEqual(installabilityErrors, []);
    assert.deepEqual(manifest.errors, []);
    const data = JSON.parse(manifest.data);
    assert.equal(data.display, 'standalone');
    assert.equal(data.id, '/app');
    assert.equal(data.start_url, '/app');
    assert.equal(data.scope, '/');
    console.log('PASS Chrome installability, manifest identity, scope and standalone display');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
