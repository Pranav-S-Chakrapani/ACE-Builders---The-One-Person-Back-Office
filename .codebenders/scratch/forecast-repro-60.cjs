const { chromium } = require('playwright');
(async () => {
  const out = {};
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.waitForTimeout(1500);
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-whatif-client', { timeout: 15000 });
  await page.selectOption('#fc-whatif-client', { label: 'Vikram Sethi' });
  const state = async () => ({
    days: await page.inputValue('#fc-whatif-days'),
    impact: await page.evaluate(() => document.querySelector('.fc-whatif__impact')?.textContent.trim() ?? null),
    status: await page.evaluate(() => [...document.querySelectorAll('.fc-alert, .fc-ok')].map(e => e.textContent.trim())),
    alertText: await page.evaluate(() => [...document.querySelectorAll('.fc-whatif__status, .fc-whatif p')].map(e => e.textContent.trim())),
    polylines: await page.evaluate(() => [...document.querySelectorAll('polyline')].map(p => p.getAttribute('class') + ' pts=' + p.getAttribute('points').split(' ').length)),
    scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
  });
  await page.fill('#fc-whatif-days', '60');
  await page.keyboard.press('Tab');
  out.delay60 = await state();
  for (const d of ['70','80','90']) {
    await page.fill('#fc-whatif-days', d);
    await page.keyboard.press('Tab');
    out['delay' + d] = await state();
  }
  out.errors = errors;
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
