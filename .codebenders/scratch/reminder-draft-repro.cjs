const { chromium } = require('playwright');
(async () => {
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { browser = await chromium.launch({ headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleMsgs = [];
  const pageErrors = [];
  page.on('console', (m) => consoleMsgs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('http://localhost:5173/#/today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const btn = page.getByRole('button', { name: 'Draft reminder' }).first();
  const readState = () => page.evaluate(() => {
    const ta = document.querySelector('textarea[aria-label="Reminder message"]');
    const panel = ta ? ta.closest('.td-panel') : null;
    const toneP = panel ? panel.querySelector('p') : null;
    return {
      tone: toneP ? toneP.textContent : null,
      valueLen: ta ? ta.value.length : null,
      valueHead: ta ? ta.value.slice(0, 160) : null,
      textContentLen: ta ? ta.textContent.length : null,
      textContentHead: ta ? ta.textContent.slice(0, 160) : null,
      disabled: ta ? ta.disabled : null,
    };
  });
  const out = {};
  await btn.click();
  await page.waitForTimeout(1500);
  out.afterOpen = await readState();
  await btn.click();
  await page.waitForTimeout(500);
  out.afterClose = await readState();
  await btn.click();
  await page.waitForTimeout(1500);
  out.afterReopen = await readState();
  out.console = consoleMsgs;
  out.pageErrors = pageErrors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('SCRIPT ERROR: ' + e.message); process.exit(1); });
