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
  await page.waitForSelector('#fc-whatif-client', { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-whatif-client', { timeout: 15000 });
  out.selectOptions = await page.$$eval('#fc-whatif-client option', os => os.map(o => o.textContent.trim()));
  out.startingBalanceInitial = await page.inputValue('#fc-starting-balance');
  const state = async () => ({
    slider: await page.inputValue('#fc-whatif-slider'),
    days: await page.inputValue('#fc-whatif-days'),
    impact: await page.evaluate(() => document.querySelector('.fc-whatif__impact')?.textContent.trim() ?? null),
    legend: await page.evaluate(() => [...document.querySelectorAll('.fc-whatif__legend-item')].map(li => li.textContent.trim())),
    status: await page.evaluate(() => [...document.querySelectorAll('.fc-alert, .fc-ok')].map(e => e.textContent.trim())),
  });
  await page.evaluate(() => { window.__marker = 'alive'; });
  await page.selectOption('#fc-whatif-client', { label: 'Vikram Sethi' });
  out.vikram15 = await state();
  await page.fill('#fc-whatif-days', '60');
  await page.keyboard.press('Tab');
  out.vikram60 = await state();
  await page.selectOption('#fc-whatif-client', { label: 'Kiran Mehta' });
  out.kiran15 = await state();
  await page.selectOption('#fc-whatif-client', { label: 'Rohan Deshpande' });
  out.rohan15 = await state();
  out.markerSurvived = await page.evaluate(() => window.__marker);
  await page.getByRole('button', { name: 'Reset scenario' }).click();
  out.afterReset = await state();
  out.clientAfterReset = await page.inputValue('#fc-whatif-client');
  out.startingBalanceAfterReset = await page.inputValue('#fc-starting-balance');
  out.errors = errors;
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
