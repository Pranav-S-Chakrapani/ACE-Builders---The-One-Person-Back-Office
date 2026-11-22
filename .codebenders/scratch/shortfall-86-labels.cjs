const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:5173/#/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.waitForTimeout(1500);
  await page.goto('http://localhost:5173/#/forecast', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#fc-whatif-client', { timeout: 15000 });
  await page.selectOption('#fc-whatif-client', { label: 'Vikram Sethi' });
  await page.fill('#fc-whatif-days', '86');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const svg = document.querySelector('.fc-chart');
    const texts = [...svg.querySelectorAll('text')].map(t => ({ t: t.textContent.trim(), x: t.getAttribute('x'), y: t.getAttribute('y') }));
    const markers = [...svg.querySelectorAll('circle')].map(c => ({ cls: c.getAttribute('class'), cx: c.getAttribute('cx'), cy: c.getAttribute('cy') }));
    const sec = document.querySelector('section.fc-section');
    return { texts, markers, alerts: [...document.querySelectorAll('.fc-section .fc-alert, .fc-section .fc-ok')].map(e => e.textContent.trim()),
      impact: document.querySelector('.fc-whatif__impact')?.textContent.trim(), zeroY: svg.querySelector('line.fc-chart__zero')?.getAttribute('y1') };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
