const { chromium } = require('playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { console.log('chrome channel failed:', e.message.split('\n')[0]); browser = await chromium.launch({ headless: true }); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForSelector('.dash-owed', { timeout: 15000 });
  console.log('A errors:', JSON.stringify(errs, null, 1));
  console.log('B body head:', (await page.evaluate(() => document.body.innerText)).slice(0, 900));
  const rows = await page.$$eval('.dash-row', els => els.map(e => ({ text: e.innerText.replace(/\n+/g, ' | '), amount: e.querySelector('.dash-row__amount')?.innerText })));
  console.log('B rows:', JSON.stringify(rows, null, 1));
  const snap = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('cleardue:v1') || 'null'); if (!d) return null; return { clients: d.clients?.length, invoices: d.invoices?.length, payments: d.payments?.length, recurringBills: d.recurringBills?.length, reminders: d.reminders?.length }; });
  console.log('C before:', JSON.stringify(await snap()));
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /Reset demo data/i }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.dash-owed', { timeout: 15000 });
  console.log('C after:', JSON.stringify(await snap()));
  console.log('C dashboard head:', (await page.evaluate(() => document.body.innerText)).slice(0, 600));
  await page.goto('http://localhost:5173/#/invoices', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'All', exact: true }).click().catch(() => {});
  await page.waitForTimeout(300);
  const nums = await page.evaluate(() => [...new Set((document.body.innerText.match(/CD-\d{4}/g) || []))]);
  console.log('C invoice numbers under All:', nums.length, JSON.stringify(nums));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForSelector('.dash-owed', { timeout: 15000 });
  const d = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, over: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 360).slice(0, 25).map(e => e.tagName + '.' + (typeof e.className === 'string' ? e.className : '') + ' right=' + Math.round(e.getBoundingClientRect().right)) }));
  console.log('D:', JSON.stringify(d, null, 1));
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
