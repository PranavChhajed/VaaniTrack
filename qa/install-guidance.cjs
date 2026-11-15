const assert = require('node:assert/strict');
const { open, closeAll } = require('./qa-lib.cjs');
(async () => {
  try {
    const { page, go, close } = await open('chromium', 'Pixel 7');
    await go('/you');
    assert.match(await page.locator('body').innerText(), /Installing this website through Chrome adds the web app/);
    assert.equal(await page.getByRole('link', {name:'Connect the widget',exact:true}).count(),0);
    await page.evaluate(()=>localStorage.setItem('vaanitrack.shell','android'));
    await page.reload();
    await page.getByRole('link',{name:'Connect the widget',exact:true}).waitFor();
    assert.match(await page.getByRole('link',{name:'Connect the widget',exact:true}).getAttribute('href'),/^intent:\/\/setup/);
    await close();
    console.log('PASS browser installation guidance and native setup discovery');
  } finally { await closeAll(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
