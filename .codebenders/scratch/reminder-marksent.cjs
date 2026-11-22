const { chromium } = require('playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e)));
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const cnt = await page.getByRole('button', { name: 'Mark as sent' }).count();
  const anyText = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /sent|mark/i.test(t)));
  const draftBtn = page.getByRole('button', { name: 'Draft reminder', exact: true }).nth(0);
  await draftBtn.click();
  await page.waitForTimeout(1500);
  const cntOpen = await page.getByRole('button', { name: 'Mark as sent' }).count();
  const cardHasMark = await page.evaluate(() => {
    const ta = document.querySelector('textarea[aria-label="Reminder message"]');
    const panel = ta ? ta.closest('.td-panel') : null;
    return panel ? [...panel.querySelectorAll('button')].map(b => b.textContent.trim()) : null;
  });
  const markOpen = page.getByRole('button', { name: 'Mark as sent' });
  let clicked = 'not clicked';
  if (cntOpen > 0) { await markOpen.first().click(); await page.waitForTimeout(800); clicked = 'clicked'; }
  const after = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Draft reminder').length);
  const remainingHeads = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,strong')].map(h => h.textContent.trim()).filter(t => /Chase|Kiran/.test(t)));
  console.log(JSON.stringify({ markCountClosed: cnt, sentLikeButtonsClosed: anyText, markCountOpen: cntOpen, buttonsInOpenPanel: cardHasMark, markClick: clicked, draftButtonsAfter: after, remainingHeadlines: remainingHeads, errs }, null, 2));
  await browser.close();
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.stack); process.exit(1); });
