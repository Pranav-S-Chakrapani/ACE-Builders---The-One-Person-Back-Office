const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
async function openCtx(browser, label, log) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const cur = { pageUrl: null };
  page.on('response', r => {
    if (r.status() >= 400) log.push({ run: label, kind: 'response', status: r.status(), url: r.url(), resourceType: r.request().resourceType(), pageUrlAtTime: page.url() });
  });
  page.on('requestfailed', r => log.push({ run: label, kind: 'requestfailed', url: r.url(), resourceType: r.resourceType(), failure: r.failure() && r.failure().errorText, pageUrlAtTime: page.url() }));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push({ run: label, kind: 'console', type: m.type(), text: m.text(), location: m.location(), pageUrlAtTime: page.url() }); });
  return { ctx, page };
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const out = [];
  // Forecast: fresh context, first load then reload
  {
    const { ctx, page } = await openCtx(browser, 'forecast', out);
    out.push({ run: 'forecast', kind: 'step', text: 'goto #/forecast' });
    await page.goto(BASE + '/#/forecast', { waitUntil: 'networkidle' });
    out.push({ run: 'forecast-run1', kind: 'step', text: 'after first load, page url=' + page.url() });
    await page.waitForTimeout(1000);
    const mark1 = out.length;
    out.push({ run: 'forecast-run2', kind: 'step', text: 'reload' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await ctx.close();
  }
  for (const route of ['#/dashboard', '#/invoices', '#/today']) {
    const { ctx, page } = await openCtx(browser, route, out);
    await page.goto(BASE + '/' + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
