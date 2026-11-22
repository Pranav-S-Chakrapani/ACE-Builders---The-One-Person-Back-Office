const { chromium } = require('playwright');
(async () => {
  const out = {};
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reset demo data' }).click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle' });
  await page.waitForSelector('.td-page', { timeout: 15000 });
  out.cards = await page.$$eval('.td-card', els => els.map(e => ({
    badge: e.querySelector('.td-badge')?.textContent.trim(),
    headline: e.querySelector('.td-headline')?.textContent.trim(),
  })));
  out.badgeCounts = out.cards.reduce((a, c) => (a[c.badge] = (a[c.badge] || 0) + 1, a), {});
  const first = page.locator('.td-card').first().getByRole('button', { name: 'Draft reminder' });
  await first.click();
  await page.waitForFunction(() => { const t = document.querySelector('.td-textarea'); return t && !t.disabled; }, null, { timeout: 15000 });
  out.toneLabel = await page.locator('.td-panel p').first().innerText();
  const v = await page.locator('.td-textarea').inputValue();
  out.textareaLength = v.length;
  out.textareaFirst120 = v.slice(0, 120);
  await page.getByRole('button', { name: 'Mark as sent' }).click();
  await page.waitForTimeout(500);
  out.cardTextAfterSent = await page.locator('.td-card').first().innerText();
  out.errors = errors;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(300);
  out.at360 = await page.evaluate(() => {
    const W = 360;
    const over = [];
    document.querySelectorAll('.td-page *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > W + 0.5) over.push(el.tagName + '.' + (el.className && el.className.baseVal === undefined ? el.className : '') + ' right=' + Math.round(r.right));
    });
    return { scrollWidth: document.documentElement.scrollWidth, overflowing: over.slice(0, 20), overflowCount: over.length };
  });
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
