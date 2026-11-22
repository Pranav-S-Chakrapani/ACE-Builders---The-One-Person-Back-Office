const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const hits = [];
  page.on('response', (r) => { if (r.status() >= 400) hits.push(r.status() + ' ' + r.url()); });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'load' });
  await page.locator('nav.tabs').waitFor();
  await page.waitForTimeout(800);
  await page.locator('.td-card--overdue').first().getByRole('button', { name: 'Draft reminder' }).click();
  await page.waitForTimeout(1500);
  console.log(JSON.stringify(hits, null, 2));
  await browser.close();
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.message); process.exit(1); });
