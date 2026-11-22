const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const errors = [];
const scrollWidths = [];

function log(tag, msg) { console.log('[' + tag + '] ' + msg); }

async function openPage(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  // Attach listeners before any goto so nothing is missed.
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      errors.push('console ' + m.type() + ': ' + m.text());
    }
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('dialog', (d) => d.accept());
  return { context, page };
}

async function go(page, width, route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  scrollWidths.push({ width, route, sw });
}

async function rect(locator) {
  if ((await locator.count()) === 0) return null;
  return locator.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top, right: r.right };
  });
}

async function measure(route, label, locator) {
  const r = await rect(locator);
  if (!r) {
    log('TOUCH', route + ' | ' + label + ' | none found');
    return;
  }
  const w = Math.round(r.w);
  const h = Math.round(r.h);
  const verdict = h >= 44 ? 'PASS' : 'FAIL';
  log('TOUCH', route + ' | ' + label + ' | ' + w + 'x' + h + ' | ' + verdict);
}

async function measureMany(route, label, base, n) {
  const count = await base.count();
  if (count === 0) {
    log('TOUCH', route + ' | ' + label + ' | none found');
    return;
  }
  for (let i = 0; i < Math.min(n, count); i++) {
    await measure(route, label + ' [' + (i + 1) + ']', base.nth(i));
  }
}

async function visibleInvoiceNumbers(page) {
  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tr, li'))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.innerText)
      .join('\n')
  );
  const found = text.match(/CD-\d{4}/g) || [];
  return [...new Set(found)].sort();
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }

  // STEP 0: 1280 context, reset demo data.
  const ctx1280 = await openPage(browser, 1280, 800);
  const p1280 = ctx1280.page;
  try {
    await p1280.goto(BASE + '/#/dashboard', { waitUntil: 'networkidle' });
    await p1280.locator('.footer__reset').click();
    await p1280.waitForTimeout(1000);
    await p1280.waitForLoadState('networkidle').catch(() => {});
    await p1280.waitForTimeout(800);
    log('STEP0', 'demo data reset done');
  } catch (e) {
    log('STEP0', 'ERROR: ' + e.message);
  }

  // CHECK 1: touch targets at 360px.
  try {
    fs.mkdirSync('screenshots', { recursive: true });
    const { context, page } = await openPage(browser, 360, 800);

    await go(page, 360, '/#/invoices');
    for (const label of ['All', 'Open', 'Overdue', 'Paid', 'Draft']) {
      const loc = page.locator('button', { hasText: new RegExp('^' + label + '$') }).first();
      await measure('#/invoices', label, loc);
    }
    await measure('#/invoices', 'Reset demo data (.footer__reset)', page.locator('.footer__reset'));
    await page.screenshot({ path: 'screenshots/polish-invoices-360.png', fullPage: true });

    const id = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('cleardue:v1')).invoices.find((i) => i.number === 'CD-0012').id
    );
    await go(page, 360, '/#/invoices/' + id);
    await measure('invoice CD-0012', 'Back to invoices (a.back-link)', page.locator('a.back-link'));
    await measure('invoice CD-0012', 'Reset demo data (.footer__reset)', page.locator('.footer__reset'));

    await go(page, 360, '/#/today');
    await measureMany('#/today', 'Draft reminder', page.locator('button', { hasText: 'Draft reminder' }), 3);
    await measureMany('#/today', 'Mark as paid', page.locator('button', { hasText: 'Mark as paid' }), 3);
    await measure('#/today', 'Reset demo data (.footer__reset)', page.locator('.footer__reset'));
    await page.screenshot({ path: 'screenshots/polish-today-360.png', fullPage: true });

    await context.close();
  } catch (e) {
    console.log('CHECK 1 ERROR: ' + e.message);
  }

  // CHECK 2: Overdue empty state at 1280px (reuses the step 0 page).
  const targets = ['CD-0012', 'CD-0013', 'CD-0014', 'CD-0015'];
  const overdueButton = () => p1280.locator('button', { hasText: /^Overdue$/ }).first();

  try {
    // A. Show the Overdue list as seeded.
    await go(p1280, 1280, '/#/invoices');
    await overdueButton().click();
    await p1280.waitForTimeout(300);
    log('CHECK2A', 'visible invoices: ' + (await visibleInvoiceNumbers(p1280)).join(', ') + ' (expected CD-0012..CD-0015)');
  } catch (e) {
    console.log('CHECK 2 ERROR (A): ' + e.message);
  }

  try {
    // B. Mark the four overdue invoices as paid directly in localStorage.
    const changed = await p1280.evaluate((nums) => {
      const key = 'cleardue:v1';
      const data = JSON.parse(localStorage.getItem(key));
      let n = 0;
      data.invoices.forEach((inv) => {
        if (nums.includes(inv.number)) { inv.status = 'paid'; n++; }
      });
      localStorage.setItem(key, JSON.stringify(data));
      return n;
    }, targets);
    log('CHECK2B', 'set status=paid on ' + changed + ' invoice(s)');

    await p1280.reload({ waitUntil: 'networkidle' });
    await p1280.waitForTimeout(500);
    await overdueButton().click();
    await p1280.waitForTimeout(300);

    const emptyMatches = await p1280.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((el) => el.children.length === 0)
        .filter((el) => {
          const cls = el.className ? el.className.toString() : '';
          const txt = el.innerText || '';
          return /empty/.test(cls) || /nice work|No invoices/i.test(txt);
        })
        .map((el) => el.tagName + '.' + (el.className ? el.className.toString() : '') + ': ' + (el.innerText || '').trim())
    );
    log('CHECK2B', 'empty-ish elements: ' + (emptyMatches.length ? emptyMatches.join(' | ') : 'none'));

    const listText = await p1280.evaluate(() => {
      const c = document.querySelector('main') || document.body;
      return c.innerText.slice(0, 600);
    });
    log('CHECK2B', 'list container text: ' + listText.replace(/\n+/g, ' / '));

    const present = (await p1280.getByText('No overdue invoices — nice work.', { exact: true }).count()) > 0;
    const remaining = (await visibleInvoiceNumbers(p1280)).filter((n) => targets.includes(n));
    log('CHECK2B', 'exact empty-state string present=' + present + ', remaining target rows=' + JSON.stringify(remaining));
    log('CHECK2B', present && remaining.length === 0 ? 'PASS' : 'FAIL');
  } catch (e) {
    console.log('CHECK 2 ERROR (B): ' + e.message);
  }

  try {
    // C. Reset demo data and confirm the Overdue list returns.
    await p1280.locator('.footer__reset').click();
    await p1280.waitForTimeout(1000);
    await p1280.waitForLoadState('networkidle').catch(() => {});
    await p1280.waitForTimeout(800);
    await overdueButton().click();
    await p1280.waitForTimeout(300);
    log('CHECK2C', 'overdue after reset: ' + (await visibleInvoiceNumbers(p1280)).join(', ') + ' (expected CD-0012..CD-0015)');
  } catch (e) {
    console.log('CHECK 2 ERROR (C): ' + e.message);
  }

  await ctx1280.context.close();

  // CHECK 3: tagline position at 1280 and 360.
  try {
    for (const width of [1280, 360]) {
      const { context, page } = await openPage(browser, width, 800);
      await go(page, width, '/#/dashboard');

      const tag = page.getByText('Your back office, in one place.', { exact: true });
      const count = await tag.count();
      log('CHECK3', 'width ' + width + ': count=' + count);

      if (count > 0) {
        const info = await tag.first().evaluate((el) => ({
          tag: el.tagName,
          className: String(el.className),
          top: el.getBoundingClientRect().top,
        }));
        const visible = await tag.first().isVisible();
        const headerBottom = await page.evaluate(() => {
          const h = document.querySelector('header') || document.querySelector('.topbar');
          return h ? h.getBoundingClientRect().bottom : null;
        });
        log('CHECK3', 'tag=' + info.tag + ' class="' + info.className + '" visible=' + visible +
          ' tagTop=' + info.top.toFixed(1) + ' headerBottom=' + headerBottom);
        const pass = count === 1 && visible && headerBottom !== null && info.top >= headerBottom;
        log('CHECK3', 'width ' + width + ': ' + (pass ? 'PASS' : 'FAIL'));
      } else {
        log('CHECK3', 'width ' + width + ': FAIL (tagline not found)');
      }

      const headings = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1, h2')).slice(0, 3).map((e) => e.innerText.trim())
      );
      log('CHECK3', 'first headings: ' + JSON.stringify(headings));

      const mainLines = await page.evaluate(() => {
        const m = document.querySelector('main');
        return m ? m.innerText.split('\n').slice(0, 3) : null;
      });
      log('CHECK3', 'first main lines: ' + JSON.stringify(mainLines));

      await context.close();
    }
  } catch (e) {
    console.log('CHECK 3 ERROR: ' + e.message);
  }

  // GLOBAL
  scrollWidths
    .filter((s) => s.width === 360)
    .forEach((s) => log('SCROLLW', s.route + ' documentElement.scrollWidth=' + s.sw));

  console.log(errors.length ? errors.join('\n') : 'no console errors or pageerrors');

  await browser.close();
  console.log('DONE');
  process.exitCode = 0;
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.message); process.exit(1); });
