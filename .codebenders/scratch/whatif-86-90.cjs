const { chromium } = require('playwright');
const delays = [86, 87, 88, 89, 90, 60];
(async () => {
  const out = { sweep: [], errors: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') out.errors.push(m.type() + ': ' + m.text()); });
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
    const labels = [...document.querySelectorAll('.fc-chart__marker-label')].map(t => t.textContent);
    return {
      numberValue: document.querySelector('#fc-whatif-days').value,
      impact: imp ? t(imp) : null,
      status: [...document.querySelectorAll('.fc-section .fc-alert, .fc-section .fc-ok')].map(t),
      chartLabels: labels,
    };
  });
  for (const d of delays) {
    await page.fill('#fc-whatif-days', String(d));
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    const st = await readState();
    st.delay = d;
    out.sweep.push(st);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.fill('#fc-whatif-days', '88');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  out.at360 = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth, delay: document.querySelector('#fc-whatif-days').value }));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
