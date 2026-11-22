const { chromium } = require('playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { console.log('chrome channel failed:', e.message.split('\n')[0]); browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForSelector('.dash-owed', { timeout: 15000 });
  const rows = await page.$$eval('.dash-row', els => els.map(e => e.innerText.replace(/\n+/g, ' | ')));
  rows.forEach((r, i) => console.log(i, r));
  const vik = await page.$$eval('.dash-row', els => els.filter(e => e.innerText.includes('Vikram')).map(e => ({
    text: e.innerText, html: e.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 800),
    amountClass: e.querySelector('.dash-row__amount')?.className,
    amountColor: e.querySelector('.dash-row__amount') && getComputedStyle(e.querySelector('.dash-row__amount')).color,
    daysClass: e.querySelector('.dash-days')?.className,
    daysColor: e.querySelector('.dash-days') && getComputedStyle(e.querySelector('.dash-days')).color,
  })));
  console.log(JSON.stringify(vik, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });

