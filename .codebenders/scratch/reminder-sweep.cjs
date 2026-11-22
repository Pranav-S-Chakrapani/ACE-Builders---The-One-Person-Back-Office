const { chromium } = require('playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleMsgs = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const load = async () => { await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };

  const listAll = () => page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Draft reminder');
    return btns.map((b) => {
      let card = b;
      while (card.parentElement && [...card.parentElement.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Draft reminder').length === 1) card = card.parentElement;
      const h = card.querySelector('h1,h2,h3,h4,strong');
      return h ? h.textContent.trim() : card.textContent.trim().slice(0, 60);
    });
  });
  const clickCard = (i) => page.evaluate((i) => {
    const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Draft reminder');
    if (!btns[i]) return 'NO_BUTTON';
    btns[i].click();
    return 'clicked';
  }, i);
  const readCard = (i) => page.evaluate((i) => {
    const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Draft reminder');
    const b = btns[i];
    if (!b) return { missing: true };
    let card = b;
    while (card.parentElement && [...card.parentElement.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Draft reminder').length === 1) card = card.parentElement;
    const h = card.querySelector('h1,h2,h3,h4,strong');
    const ta = card.querySelector('textarea[aria-label="Reminder message"]');
    const panel = ta ? ta.closest('.td-panel') : null;
    const toneP = panel ? panel.querySelector('p') : null;
    const v = ta ? ta.value : null;
    return {
      headline: h ? h.textContent.trim() : null,
      tone: toneP ? toneP.textContent.trim() : null,
      textareaPresent: !!ta,
      valueLen: v === null ? null : v.length,
      valueHead: v === null ? null : v.slice(0, 100),
      empty: v === null ? null : v.trim().length === 0,
      stuckDrafting: v === null ? null : v.indexOf('Drafting') !== -1
    };
  }, i);

  const out = { sweep: [], markAsSent: null, afterMarkDraft: null, freshLoadKiran: null };
  await load();
  const names = await listAll();
  out.cardOrder = names;
  for (let i = 0; i < names.length; i++) {
    await clickCard(i);
    await page.waitForTimeout(1500);
    const r = await readCard(i);
    out.sweep.push({ i, ...r });
    await clickCard(i);
    await page.waitForTimeout(500);
  }

  // (a) fresh load, due-soon card (Kiran Mehta)
  await load();
  const names2 = await listAll();
  const k = names2.findIndex((n) => n.indexOf('Kiran') !== -1);
  if (k >= 0) {
    await clickCard(k);
    await page.waitForTimeout(1500);
    out.freshLoadKiran = { i: k, ...(await readCard(k)) };
    await clickCard(k);
    await page.waitForTimeout(500);
  } else { out.freshLoadKiran = 'Kiran card not found; names=' + JSON.stringify(names2); }

  // (b) first overdue card: Mark as sent, then Draft on a different card
  await load();
  const names3 = await listAll();
  const first = names3[0];
  const mark = page.getByRole('button', { name: 'Mark as sent' });
  out.markAsSent = { firstCard: first, markButtonCount: await mark.count() };
  if (await mark.count() > 0) { await mark.first().click(); await page.waitForTimeout(800); }
  const names4 = await listAll();
  out.afterMarkNames = names4;
  const other = names4.findIndex((n) => n !== first);
  if (other >= 0) {
    await clickCard(other);
    await page.waitForTimeout(1500);
    out.afterMarkDraft = { i: other, ...(await readCard(other)) };
  } else { out.afterMarkDraft = 'no other card'; }

  out.consoleErrorsAndWarnings = consoleMsgs;
  out.pageErrors = pageErrors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.stack); process.exit(1); });
