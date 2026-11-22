const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => bad.push('failed ' + r.url()));
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-starting-balance', { timeout: 15000 });
  const cardText = await page.$$eval('.fc-card__value', els => els.map(e => e.textContent));
  console.log('failing responses:', JSON.stringify(bad));
  console.log('card values (codepoints of first char):', cardText.map(t => t.codePointAt(0).toString(16) + ' ' + JSON.stringify(t)).join(' | '));
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });