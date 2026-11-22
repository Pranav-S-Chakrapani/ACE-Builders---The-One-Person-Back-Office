const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const errors = [];

function log(section, text) {
  console.log(`[${section}] ${text}`);
}

function sectionError(section, e) {
  console.log(`SECTION ${section} ERROR: ${e && e.message ? e.message : e}`);
}

function ymd(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    log('init', `chrome channel failed (${String(e.message).split('\n')[0]}); falling back to bundled chromium`);
    return chromium.launch({ headless: true });
  }
}

async function newPage(browser, W, ctx) {
  const context = await browser.newContext({ viewport: { width: W, height: 800 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${ctx}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${ctx}] pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { context, page };
}

async function storeCounts(page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cleardue:v1') || '{}');
    return { invoices: (s.invoices || []).length, reminders: (s.reminders || []).length };
  });
}

async function invoiceNumbers(page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cleardue:v1') || '{}');
    return (s.invoices || []).map((i) => i.number);
  });
}

async function dashSnapshot(page, tag) {
  for (const label of ['Total outstanding', 'Overdue', 'Paid this month']) {
    const txt = await page.evaluate((lbl) => {
      const els = Array.from(document.querySelectorAll('.dash-card'))
        .filter((el) => (el.innerText || '').includes(lbl));
      return els.length ? els[0].innerText.replace(/\s+/g, ' ').trim() : 'NOT FOUND';
    }, label);
    log(tag, `${label}: ${txt}`);
  }
  const who = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4')).find((e) => /who owes/i.test(e.innerText || ''));
    return h ? ((h.closest('section') || h.parentElement).innerText || '').replace(/\s+/g, ' ').trim() : 'NOT FOUND';
  });
  log(tag, `who owes: ${who}`);
}

async function main() {
  const browser = await launch();
  const desk = await newPage(browser, 1280, 'desktop');
  const page = desk.page;

  // SECTION A (reset)
  try {
    await page.goto(BASE + '/#/dashboard');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await page.waitForTimeout(800);
    await page.waitForLoadState('load');
    log('A', 'reset done');
  } catch (e) {
    sectionError('A', e);
  }

  // SECTION B (layout)
  let ID_CD0012 = null;
  try {
    for (const W of [360, 1280]) {
      const lc = await newPage(browser, W, `layout-${W}`);
      const lp = lc.page;
      try {
        await lp.goto(BASE + '/#/dashboard');
        await lp.waitForTimeout(800);
        if (!ID_CD0012) {
          ID_CD0012 = await lp.evaluate(
            () => JSON.parse(localStorage.getItem('cleardue:v1')).invoices.find((i) => i.number === 'CD-0012').id
          );
        }
      } catch (e) {
        sectionError('B', e);
      }
      const routes = ['#/dashboard', '#/invoices', '#/invoices/' + ID_CD0012, '#/forecast', '#/today'];
      for (const route of routes) {
        try {
          await lp.goto(BASE + '/' + route);
          await lp.waitForTimeout(800);

          const sizes = await lp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
          log('B', `${W} ${route} scrollWidth=${sizes.sw} innerWidth=${sizes.iw}`);

          const overflow = await lp.evaluate(() => {
            const iw = window.innerWidth;
            const out = [];
            for (const el of Array.from(document.querySelectorAll('body *'))) {
              const r = el.getBoundingClientRect();
              if (r.right > iw + 0.5) {
                out.push({
                  tag: el.tagName.toLowerCase(),
                  cls: String(el.getAttribute('class') || ''),
                  text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 40),
                  right: Math.round(r.right * 10) / 10,
                });
                if (out.length >= 20) break;
              }
            }
            return out;
          });
          log('B', `${W} ${route} elements past right edge: ${overflow.length}`);
          for (const o of overflow) log('B', `  <${o.tag} class="${o.cls}"> "${o.text}" right=${o.right}`);

          if (W === 360) {
            const small = await lp.evaluate(() => {
              const out = [];
              for (const el of Array.from(document.querySelectorAll('button, a'))) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                if (r.width < 44 || r.height < 44) {
                  out.push({
                    tag: el.tagName.toLowerCase(),
                    text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40),
                    size: Math.round(r.width) + 'x' + Math.round(r.height),
                  });
                  if (out.length >= 20) break;
                }
              }
              return out;
            });
            log('B', `${W} ${route} small touch targets: ${small.length}`);
            for (const s of small) log('B', `  <${s.tag}> "${s.text}" ${s.size}`);
          }

          const clipped = await lp.evaluate(() => {
            const out = [];
            for (const el of Array.from(document.querySelectorAll('body *'))) {
              if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
                out.push({ tag: el.tagName.toLowerCase(), cls: String(el.getAttribute('class') || '') });
                if (out.length >= 20) break;
              }
            }
            return out;
          });
          log('B', `${W} ${route} overflowing containers: ${clipped.length}`);
          for (const c of clipped) log('B', `  <${c.tag} class="${c.cls}">`);

          if (route === '#/forecast') {
            const svgs = await lp.evaluate(() =>
              Array.from(document.querySelectorAll('svg')).map((s) => {
                const r = s.getBoundingClientRect();
                return Math.round(r.width) + 'x' + Math.round(r.height);
              })
            );
            log('B', `${W} forecast svg sizes: ${svgs.join(', ') || 'none'}`);
          }

          fs.mkdirSync('screenshots', { recursive: true });
          const shot = path.join('screenshots', 'audit-' + route.replace(/[^a-z0-9]+/gi, '_') + '-' + W + '.png');
          await lp.screenshot({ path: shot, fullPage: true });
          log('B', `screenshot ${shot}`);
        } catch (e) {
          sectionError('B', e);
        }
      }
      await lc.context.close();
    }
  } catch (e) {
    sectionError('B', e);
  }

  // SECTION C (chips, desktop)
  try {
    await page.goto(BASE + '/#/invoices');
    await page.waitForTimeout(500);
    for (const label of ['All', 'Open', 'Overdue', 'Paid', 'Draft']) {
      await page.locator('.chips').first().getByRole('button', { name: label, exact: true }).first().click();
      await page.waitForTimeout(200);
      const table = page.locator('table.inv-table');
      let count;
      let text;
      if (await table.isVisible()) {
        count = await page.locator('table.inv-table tbody tr').count();
        text = await table.innerText();
      } else {
        count = await page.locator('ul.inv-cards li').count();
        text = await page.locator('ul.inv-cards').innerText().catch(() => '');
      }
      const nums = [...new Set(text.match(/CD-\d{4}/g) || [])].sort();
      log('C', `${label}: count=${count} numbers=${nums.join(',') || 'none'}`);
    }
  } catch (e) {
    sectionError('C', e);
  }

  // SECTION D (demo chain, desktop)
  let NEW = null;
  let clientName = null;
  let cardIdx = -1;
  let cardLoc = null;

  try {
    await page.goto(BASE + '/#/dashboard');
    await page.waitForTimeout(500);
    await dashSnapshot(page, 'D0');
    log('D0', `counts ${JSON.stringify(await storeCounts(page))}`);
  } catch (e) {
    sectionError('D0', e);
  }

  try {
    await page.goto(BASE + '/#/invoices');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'New invoice' }).first().click();
    await page.waitForTimeout(300);
    const clientSel = page.locator('#inv-client');
    const vals = await clientSel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter((v) => v));
    await clientSel.selectOption(vals[0]);
    await page.locator('#inv-amount').fill('15000');
    await page.locator('#inv-description').fill('Brand refresh');
    const issue = new Date();
    issue.setDate(issue.getDate() - 10);
    const due = new Date();
    due.setDate(due.getDate() - 3);
    await page.locator('#inv-issue').fill(ymd(issue));
    await page.locator('#inv-due').fill(ymd(due));
    await page.locator('#inv-status').selectOption('sent');
    const before = await invoiceNumbers(page);
    await page.getByRole('button', { name: 'Save invoice' }).click();
    await page.waitForTimeout(400);
    NEW = await page.evaluate((prev) => {
      const s = JSON.parse(localStorage.getItem('cleardue:v1'));
      const inv = (s.invoices || []).find((i) => !prev.includes(i.number));
      if (!inv) return null;
      const client = (s.clients || []).find((c) => Object.values(inv).includes(c.id));
      return { number: inv.number, id: inv.id, clientName: client ? client.name : null };
    }, before);
    if (!NEW) {
      log('D1', 'D1 FAILED: no invoice saved');
      const errs = await page.locator('.field-error').allInnerTexts();
      if (errs.length === 0) log('D1', 'field errors: none found');
      for (const e of errs) log('D1', `field error: ${e.replace(/\s+/g, ' ').trim()}`);
      throw new Error('D1 failed; skipping rest of section D');
    }
    clientName = NEW.clientName;
    log('D1', `new invoice ${NEW.number} id=${NEW.id} client=${clientName}`);
    const row = page
      .locator('table.inv-table tbody tr, ul.inv-cards li')
      .filter({ hasText: NEW.number })
      .first();
    const rowText = await row.innerText().catch(() => 'NOT FOUND');
    log('D1', `new row text: ${rowText.replace(/\s+/g, ' ')}`);
  } catch (e) {
    sectionError('D1', e);
  }

  try {
    if (!NEW) throw new Error('D1 failed; skipping D2-D5');
    await page.goto(BASE + '/#/today');
    await page.waitForTimeout(500);
    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.td-card')).map((c) => ({
        badge: ((c.querySelector('.td-badge') || {}).innerText || '').trim(),
        headline: ((c.querySelector('.td-headline') || {}).innerText || '').trim(),
      }))
    );
    cards.forEach((c, i) => log('D2', `card ${i}: badge="${c.badge}" headline="${c.headline}"`));
    const all = page.locator('.td-card');
    const n = await all.count();
    for (let i = 0; i < n; i++) {
      const t = await all.nth(i).innerText();
      if (clientName && t.includes(clientName)) {
        cardIdx = i;
        break;
      }
    }
    if (cardIdx >= 0) {
      log('D2', `new client "${clientName}" card found at index ${cardIdx}: badge="${cards[cardIdx].badge}"`);
    } else {
      log('D2', `new client "${clientName}" card NOT found on Today`);
    }
  } catch (e) {
    sectionError('D2', e);
  }

  try {
    if (cardIdx < 0) throw new Error('no card for new client; skipping D3-D4');
    cardLoc = page.locator('.td-card').nth(cardIdx);
    await cardLoc.getByRole('button', { name: 'Draft reminder' }).click();
    const ta = page.locator('textarea[aria-label="Reminder message"]').first();
    const t0 = Date.now();
    let sawDrafting = false;
    let leftMs = null;
    let val = '';
    while (Date.now() - t0 < 5000) {
      val = (await ta.count()) ? await ta.inputValue() : '';
      if (val === 'Drafting…') {
        sawDrafting = true;
      } else if (sawDrafting && leftMs === null) {
        leftMs = Date.now() - t0;
      }
      if (val && val !== 'Drafting…' && sawDrafting) break;
      await page.waitForTimeout(100);
    }
    const full = (await ta.count()) ? await ta.inputValue() : '';
    const tone = await cardLoc.locator('.td-panel p > span:last-child').first().innerText().catch(() => 'NOT FOUND');
    log('D3', `saw "Drafting…": ${sawDrafting}; left after ${leftMs === null ? 'n/a' : leftMs + ' ms'}`);
    log('D3', `tone: ${tone}`);
    log('D3', `textarea value:\n${full}`);
  } catch (e) {
    sectionError('D3', e);
  }

  try {
    if (!cardLoc) throw new Error('no card');
    const before = await storeCounts(page);
    await cardLoc.getByRole('button', { name: 'Mark as sent' }).click();
    await page.waitForTimeout(300);
    const txt = await cardLoc.innerText().catch(() => '(card no longer rendered)');
    const after = await storeCounts(page);
    log('D4', `reminders ${before.reminders} -> ${after.reminders}`);
    log('D4', `card after: ${txt.replace(/\s+/g, ' ')}`);
  } catch (e) {
    sectionError('D4', e);
  }

  try {
    if (!NEW) throw new Error('no new invoice');
    await page.goto(BASE + '/#/invoices');
    await page.waitForTimeout(500);
    let link = page.locator(`a[href*="${NEW.id}"]`).first();
    if ((await link.count()) === 0) link = page.getByRole('link', { name: NEW.number }).first();
    await link.click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await page.waitForTimeout(300);
    const detail = await page.locator('body').innerText();
    const lines = detail
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => /status|balance|paid|sent|overdue|draft/i.test(s))
      .slice(0, 15);
    log('D5', `detail lines: ${lines.join(' | ')}`);
    log('D5', `url: ${page.url()}`);
  } catch (e) {
    sectionError('D5', e);
  }

  try {
    await page.goto(BASE + '/#/dashboard');
    await page.waitForTimeout(500);
    await dashSnapshot(page, 'D6');
    log('D6', `counts ${JSON.stringify(await storeCounts(page))}`);
    const nums6 = await invoiceNumbers(page);
    log('D6', `invoice count from localStorage: ${nums6.length}`);
    log('D6', `new invoice ${NEW ? NEW.number : 'n/a'} present: ${NEW ? nums6.includes(NEW.number) : 'n/a'}`);
  } catch (e) {
    sectionError('D6', e);
  }

  try {
    await page.goto(BASE + '/#/forecast');
    await page.waitForTimeout(500);
    const cardsTxt = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="card"]'))
        .filter((el) => !el.querySelector('[class*="card"]'))
        .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 10)
    );
    cardsTxt.forEach((t) => log('D7', `card: ${t}`));
    let start = page.getByLabel(/starting balance/i).first();
    if ((await start.count()) === 0) start = page.locator('input[type="number"]').first();
    const startVal = (await start.count()) ? await start.inputValue() : 'NOT FOUND';
    log('D7', `starting balance input value: ${startVal}`);
  } catch (e) {
    sectionError('D7', e);
  }

  try {
    await page.goto(BASE + '/#/dashboard');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await page.waitForTimeout(800);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    const c = await storeCounts(page);
    const exists = NEW
      ? await page.evaluate(
          (num) => JSON.parse(localStorage.getItem('cleardue:v1')).invoices.some((i) => i.number === num),
          NEW.number
        )
      : 'n/a';
    log('D8', `new invoice ${NEW ? NEW.number : 'n/a'} exists after reset: ${exists}`);
    const nums8 = await invoiceNumbers(page);
    log('D8', `invoice count from localStorage: ${nums8.length} (invoices=${c.invoices})`);
    log('D8', `new invoice ${NEW ? NEW.number : 'n/a'} present: ${NEW ? nums8.includes(NEW.number) : 'n/a'}`);
    log('D8', `reminders=${c.reminders} (logged, not asserted)`);
  } catch (e) {
    sectionError('D8', e);
  }

  // SECTION E (errors)
  log('E', errors.length ? '\n' + errors.join('\n') : 'none');

  await desk.context.close();
  await browser.close();
  console.log('DONE');
  process.exitCode = 0;
}

main().catch((e) => {
  console.log('FATAL: ' + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
