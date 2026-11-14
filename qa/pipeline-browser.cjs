// Real local API + parser + browser persistence. ASR fixture in the server only.
const assert=require('node:assert/strict');
const {pw,seedScript,DEVICE}=require('./qa-lib.cjs');
async function main() {
  const browser=await pw.chromium.launch({headless:true});
  try {
    const context=await browser.newContext({...pw.devices['Pixel 7']});
    await context.addInitScript(seedScript('ready',{device:DEVICE}));
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:3202/app');
    await page.locator('[data-typed-entry]').fill('I spent 250 on lunch');
    await page.locator('form button[type=submit]').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('vaanitrack.transactions')||'[]').length===1);
    let rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('vaanitrack.transactions')));
    assert.equal(rows[0].amount.value,250); assert.equal(rows[0].description.value,'lunch');
    await page.reload();
    rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('vaanitrack.transactions')));
    assert.equal(rows.length,1);
    assert.deepEqual(errors,[]);
    // The fixture rejects all model calls: an ambiguous decimal must take
    // that fallback, while a supported integer remains local to the parser.
    const fractional=await context.request.post('http://127.0.0.1:3202/api/extract',{
      data:{text:'2.50 lunch',today:'2026-11-15',defaultPayment:'Cash'},
    });
    assert.equal(fractional.status(),502);
    await page.screenshot({path:'qa/shots/verification/slm-browser.png'});
    console.log('PASS real API → parser → browser save → reload persistence');
    await context.close();
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
