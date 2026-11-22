const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
(async () => {
  let browser; let channel = 'chrome';
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { channel = 'bundled-chromium (chrome channel failed: ' + String(e.message).split('\n')[0] + ')'; browser = await chromium.launch({ headless: true }); }
  const out = { channel };
  const consoleErrors = []; const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE + '/#/today', { waitUntil: 'load' });
  await page.locator('nav.tabs').waitFor();
  await Promise.all([page.waitForEvent('load'), page.locator('.footer__reset').click()]);
  await page.goto(BASE + '/#/today', { waitUntil: 'load' });
  await page.locator('nav.tabs').waitFor();
  await sleep(800);
  out.cardCount = await page.locator('.td-card').count();
  out.cardHeadlines = await page.locator('.td-card h3').allInnerTexts();

  const undefCount = () => page.evaluate(() => {
    const t = document.body.innerText; const hits = []; const re = /undefined/gi; let m;
    while ((m = re.exec(t)) !== null) hits.push(t.slice(Math.max(0, m.index - 80), m.index + 40).replace(/\s+/g, ' '));
    return { count: hits.length, contexts: hits };
  });
  async function openDraft(card) {
    await card.getByRole('button', { name: 'Draft reminder' }).click();
    const ta = card.locator('textarea[aria-label="Reminder message"]');
    await ta.waitFor();
    const deadline = Date.now() + 10000;
    let sawDrafting = false;
    while (Date.now() < deadline) {
      const v = await ta.inputValue();
      if (v === 'Drafting…') sawDrafting = true;
      if (!(await ta.isDisabled()) && v !== 'Drafting…') break;
      await sleep(150);
    }
    const tone = await card.locator('.td-panel p').first().textContent();
    return { sawDrafting, value: await ta.inputValue(), textareaDisabled: await ta.isDisabled(), toneText: tone };
  }

  // 4a: before
  out.undefinedBefore = await undefCount();
  const overdue = page.locator('.td-card--overdue').first();
  out.firstOverdueHeadline = await overdue.locator('h3').innerText();
  const fo = await openDraft(overdue);
  const markFirst = overdue.getByRole('button', { name: 'Mark as sent' });
  out.firstOverdueMarkEnabledBeforeClick = !(await markFirst.isDisabled());
  if (out.firstOverdueMarkEnabledBeforeClick) await markFirst.click();
  await sleep(500);
  out.firstOverdueDraftValueLen = fo.value.length;
  out.undefinedAfter = await undefCount();

  // 4b: Priya and Kiran
  const priya = page.locator('.td-card', { hasText: 'Priya Nair' });
  out.priyaCardMatches = await priya.count();
  out.priyaDraft = await openDraft(priya.first());
  const kiran = page.locator('.td-card', { hasText: 'Kiran Mehta' });
  out.kiranCardMatches = await kiran.count();
  out.kiranDraft = await openDraft(kiran.first());

  // 4c: Mark as sent enablement on Kiran card
  const kMark = kiran.first().getByRole('button', { name: 'Mark as sent' });
  const kTa = kiran.first().locator('textarea[aria-label="Reminder message"]');
  out.c_nonEmpty = { textLen: (await kTa.inputValue()).length, markDisabledProp: await kMark.isDisabled(), markDisabledAttr: await kMark.getAttribute('disabled') };
  await kTa.fill('');
  await sleep(200);
  out.c_cleared = { textLen: (await kTa.inputValue()).length, markDisabledProp: await kMark.isDisabled(), markDisabledAttr: await kMark.getAttribute('disabled') };

  out.consoleErrors = consoleErrors;
  out.pageErrors = pageErrors;
  await context.close();

  // 6: 360px scrollWidth
  const ctx360 = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const p360 = await ctx360.newPage();
  await p360.goto(BASE + '/#/today', { waitUntil: 'load' });
  await p360.locator('nav.tabs').waitFor();
  await p360.waitForTimeout(500);
  out.scrollWidth360 = await p360.evaluate(() => document.documentElement.scrollWidth);
  await ctx360.close();
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.stack); process.exit(1); });
