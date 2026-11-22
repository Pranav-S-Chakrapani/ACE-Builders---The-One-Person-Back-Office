const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const out = { rows: [], errors: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => out.errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.waitForTimeout(1500);
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-whatif-client', { timeout: 15000 });
  await page.selectOption('#fc-whatif-client', { label: 'Vikram Sethi' });
  const readState = () => page.evaluate(() => {
    const t = el => el.textContent.replace(/\s+/g, ' ').trim();
    const imp = document.querySelector('.fc-whatif__impact');
    const svg = document.querySelector('.fc-chart');
    const pl = svg && svg.querySelector('polyline.fc-chart__line--scenario');
    const zero = svg && svg.querySelector('line.fc-chart__zero');
    return {
      numberValue: document.querySelector('#fc-whatif-days').value,
      impact: imp ? t(imp) : null,
      status: [...document.querySelectorAll('.fc-section .fc-alert, .fc-section .fc-ok')].map(t),
      zeroY: zero ? zero.getAttribute('y1') : null,
      scenarioPoints: pl ? pl.getAttribute('points') : null,
    };
  });
  const setDelay = async (d) => {
    await page.fill('#fc-whatif-days', String(d));
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
  };
  for (const d of [81,82,83,84,85,86,87,88,89,90]) {
    await setDelay(d);
    const st = await readState();
    st.delay = d;
    out.rows.push(st);
  }
  out.baseline = await (async () => { await setDelay(0); return readState(); })();
  fs.writeFileSync('.codebenders/scratch/sweep-81-90.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
