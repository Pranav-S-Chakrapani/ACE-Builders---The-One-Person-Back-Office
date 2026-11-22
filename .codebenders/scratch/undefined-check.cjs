const { chromium } = require('playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const cards = () => page.evaluate(() => Array.from(document.querySelectorAll('.td-card')).map((c) => ({
    overdue: c.classList.contains('td-card--overdue'),
    headline: c.querySelector('.td-headline')?.textContent ?? null,
    detail: Array.from(c.querySelectorAll('p.td-muted')).map((p) => p.textContent).filter((t) => t !== 'Marked as sent'),
  })));
  const before = await cards();
  const firstOverdue = page.locator('.td-card--overdue').first();
  await firstOverdue.getByRole('button', { name: 'Draft reminder' }).click();
  await page.waitForTimeout(1500);
  await firstOverdue.getByRole('button', { name: 'Mark as sent' }).click();
  await page.waitForTimeout(800);
  const after = await cards();
  const text = await page.evaluate(() => document.body.innerText);
  const hits = [];
  let idx = text.indexOf('undefined');
  while (idx !== -1) { hits.push(text.slice(Math.max(0, idx - 80), idx + 80)); idx = text.indexOf('undefined', idx + 1); }
  console.log(JSON.stringify({ before, after, undefinedCount: hits.length, undefinedContexts: hits }, null, 2));
  console.log(hits.length === 0 ? 'RESULT: PASS (0 occurrences of "undefined")' : 'RESULT: FAIL (' + hits.length + ' occurrence(s))');
  await browser.close();
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.message); process.exit(1); });
