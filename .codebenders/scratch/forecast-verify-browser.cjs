const { chromium } = require('playwright');
(async () => {
  const out = {};
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { out.launchNote = 'chrome channel failed: ' + e.message.split('\n')[0]; browser = await chromium.launch({ headless: true }); }
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.waitForTimeout(1500);
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-starting-balance', { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-starting-balance', { timeout: 15000 });
  out.startingBalanceValue = await page.inputValue('#fc-starting-balance');
  out.cards = await page.$$eval('.fc-card', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  out.statusLine = await page.evaluate(() => (document.querySelector('.fc-alert') || document.querySelector('.fc-ok'))?.textContent.trim());
  out.totals = await page.$$eval('.fc-total', els => els.map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  out.bills = await page.$$eval('.fc-list__row', els => els.map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  out.axisLabels = await page.$$eval('.fc-chart text.fc-chart__axis', els => els.map(t => t.textContent.trim()));
  out.errors = errors;
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
