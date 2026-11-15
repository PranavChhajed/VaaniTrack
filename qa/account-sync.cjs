const assert = require('node:assert/strict');
const { open, closeAll } = require('./qa-lib.cjs');
let checks = 0;
function check(value) { assert.ok(value); checks++; }
async function main() {
  const { page, go, state, close } = await open('chromium', 'Pixel 7', { seed: 'full' });
  const account = { id: '11111111-2222-4333-8444-555555555555', email: 'beta@example.test' };
  let verified = false, rejectCode = true;
  const rows = new Map();
  await page.route('**/api/account/session', async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === 'DELETE') { verified = false; return route.fulfill({ json: { ok: true } }); }
    if (route.request().method() === 'GET') return route.fulfill({ status: verified ? 200 : 401, json: verified ? { account } : { error: 'Sign in' } });
    if (body.action === 'send') return route.fulfill({ json: { ok: true } });
    if (rejectCode) return route.fulfill({ status: 401, json: { error: 'That code expired or is incorrect.' } });
    verified = true;
    return route.fulfill({ json: { account } });
  });
  await page.route('**/api/account/journal', async route => {
    check(route.request().headers()['x-vaani-account'] === account.id);
    if (route.request().method() === 'GET') return route.fulfill({ json: { rows: [...rows.values()] } });
    const op = route.request().postDataJSON();
    const row = { id: op.id, revision: op.baseRevision + 1, data: op.data, deleted: op.deleted };
    rows.set(op.id, row);
    return route.fulfill({ json: { conflict: false, row } });
  });
  await go('/signin');
  const guest = await page.evaluate(() => localStorage.getItem('vaanitrack.transactions'));
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('Email code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await page.locator('p[role=alert]').waitFor();
  check(await page.evaluate(() => localStorage.getItem('vaanitrack.account.active')) === null);
  rejectCode = false;
  await page.getByRole('button', { name: 'Verify code' }).click();
  await page.waitForURL('**/app');
  await page.getByRole('button', { name: /^Import .* expenses into this account/ }).waitFor();
  check(await page.evaluate(() => localStorage.getItem('vaanitrack.transactions')) === guest);
  check(rows.size === 0);
  await page.getByRole('button', { name: /^Import .* expenses into this account/ }).click();
  await page.waitForFunction(id => JSON.parse(localStorage.getItem(`vaanitrack.account.${id}.journal`)).pending.length === 0, account.id, { timeout: 30000 });
  check(rows.size === JSON.parse(guest).length);
  const second = await page.context().newPage();
  await second.goto(new URL('/app', page.url()).href);
  await second.getByRole('heading', { name: 'Opening your account journal' }).waitFor();
  check(await second.getByText('If VaaniTrack is open in another tab', { exact: false }).isVisible());
  await second.close();
  await page.reload();
  check(await page.getByRole('button', { name: /^Import .* expenses into this account/ }).count() === 0);
  await go('/you');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  check(await page.evaluate(() => localStorage.getItem('vaanitrack.account.active')) === null);
  check(await page.evaluate(() => localStorage.getItem('vaanitrack.transactions')) === guest);
  check(state.errors.length === 0);
  await close();
  console.log(`Account browser flow: ${checks} checks passed (mock provider and journal)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeAll);
