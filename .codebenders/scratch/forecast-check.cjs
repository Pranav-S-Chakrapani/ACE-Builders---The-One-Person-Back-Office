const { chromium } = require('playwright');
const out = {};
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { out.launchNote = 'chrome channel failed: ' + e.message.split('\n')[0]; browser = await chromium.launch({ headless: true }); }
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-starting-balance', { timeout: 15000 });
  const readState = async () => page.evaluate(() => {
    const dateRe = /^\d{1,2} [A-Z][a-z]{2}$/;
    const axis = [...document.querySelectorAll('.fc-chart text.fc-chart__axis')].map(t => t.textContent.trim()).filter(t => dateRe.test(t));
    const alert = document.querySelector('.fc-alert');
    const ok = document.querySelector('.fc-ok');
    return {
      sectionTitle: document.querySelector('#fc-chart-title')?.textContent,
      summaryOrStatus: (alert || ok)?.textContent.trim(),
      axisDateLabels: axis,
      activeToggle: document.querySelector('.fc-toggle__btn--active')?.textContent,
      totals: [...document.querySelectorAll('.fc-total')].map(t => t.innerText.replace(/\s+/g, ' ').trim()),
    };
  });
  out.startingBalanceValue = await page.inputValue('#fc-starting-balance');
  out.cards = await page.$$eval('.fc-card', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  out.initialState = await readState();
  out.browserToday = await page.evaluate(() => new Date().toString());
  out.toggles = {};
  for (const n of [30, 60, 90]) {
    await page.getByRole('button', { name: n + ' days', exact: true }).click();
    await page.waitForTimeout(250);
    out.toggles[n] = await readState();
  }
  out.errors = errors.slice();
  await browser.close();

  const mobile = await browser.constructor.name && null;
  const b2 = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const p2 = await b2.newPage({ viewport: { width: 360, height: 800 } });
  await p2.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await p2.waitForSelector('#fc-starting-balance', { timeout: 15000 });
  out.mobile360 = await p2.evaluate(() => {
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > 360.5) over.push({ tag: el.tagName, cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 60), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40) });
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, overflowCount: over.length, overflow: over.slice(0, 15) };
  });
  await b2.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });