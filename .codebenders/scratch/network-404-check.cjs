const { chromium } = require('playwright');
(async () => {
  let browser;
  let launchNote = 'chrome channel';
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { launchNote = 'chrome channel failed, used bundled chromium: ' + e.message.split('\n')[0]; browser = await chromium.launch({ headless: true }); }
  console.log('LAUNCH: ' + launchNote);
  const routes = ['#/dashboard', '#/invoices', '#/forecast', '#/today'];
  for (const r of routes) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const bad = [];
    const all = [];
    page.on('response', res => { all.push(res.status() + ' ' + res.request().method() + ' ' + res.url()); if (res.status() >= 400) bad.push(res.status() + ' ' + res.url()); });
    page.on('requestfailed', req => bad.push('REQUEST FAILED ' + req.url() + ' ' + (req.failure() && req.failure().errorText)));
    const url = 'http://localhost:5173/' + r;
    let nav = 'ok';
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }); } catch (e) { nav = 'goto error: ' + e.message.split('\n')[0]; }
    await page.waitForTimeout(1000);
    console.log('ROUTE ' + url + ' nav=' + nav + ' totalResponses=' + all.length + ' finalUrl=' + page.url());
    if (bad.length === 0) console.log('  >=400 responses: none');
    for (const b of bad) console.log('  >=400: ' + b);
    await context.close();
  }
  await browser.close();
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
