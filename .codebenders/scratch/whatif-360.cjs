const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-whatif-client');
  await page.selectOption('#fc-whatif-client', { label: 'Vikram Sethi' });
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > 360.5) over.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' right=' + r.right.toFixed(1));
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, over: over.slice(0, 20), overCount: over.length };
  });
  console.log(JSON.stringify({ res, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
