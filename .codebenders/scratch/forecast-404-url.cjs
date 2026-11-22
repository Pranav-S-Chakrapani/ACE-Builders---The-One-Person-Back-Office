const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('response', r => { if (r.status() === 404) console.log('404 URL: ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error') console.log('console error at ' + JSON.stringify(m.location()) + ': ' + m.text()); });
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
