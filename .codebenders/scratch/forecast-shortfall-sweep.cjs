const { chromium } = require('playwright');
const fs = require('fs');
const delays = [60, 70, 80, 90, 100, 110, 120];
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

  const setDelay = async (d) => {
    await page.fill('#fc-whatif-days', String(d));
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
  };
  const readState = () => page.evaluate(() => {
    const t = el => el.textContent.replace(/\s+/g, ' ').trim();
    const imp = document.querySelector('.fc-whatif__impact');
    return {
      numberValue: document.querySelector('#fc-whatif-days').value,
      sliderValue: document.querySelector('#fc-whatif-slider').value,
      impact: imp ? t(imp) : null,
      status: [...document.querySelectorAll('.fc-section .fc-alert, .fc-section .fc-ok')].map(t),
    };
  });

  // Step 2: baseline (delay 0 means no shift, impact sentence states the baseline low).
  await setDelay(0);
  out.baselineAt0 = await readState();

  let firstShort = null;
  for (const d of delays) {
    await setDelay(d);
    const st = await readState();
    st.delay = d;
    out.sweep.push(st);
    if (st.status.some(s => /Cash shortfall/.test(s) && /\bif\b/.test(s))) { firstShort = d; break; }
  }
  out.firstShortfallDelay = firstShort;

  if (firstShort !== null) {
    const info = await page.evaluate(() => {
      const svg = document.querySelector('.fc-chart');
      const vb = svg.viewBox.baseVal;
      const inVB = b => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1),
        inViewBox: b.x >= 0 && b.y >= 0 && b.x + b.width <= vb.width && b.y + b.height <= vb.height });
      const scr = el => { const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) }; };
      const markers = [...svg.querySelectorAll('.fc-chart__marker')].map(c => ({
        selector: 'svg.fc-chart circle.fc-chart__marker', cls: c.getAttribute('class'),
        cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), svgBBox: inVB(c.getBBox()), screen: scr(c) }));
      const labels = [...svg.querySelectorAll('.fc-chart__marker-label')].map(t => ({
        text: t.textContent, x: t.getAttribute('x'), y: t.getAttribute('y'), svgBBox: inVB(t.getBBox()), screen: scr(t) }));
      const scenLine = svg.querySelector('polyline.fc-chart__line--scenario');
      const pts = scenLine.getAttribute('points').split(' ').map(p => p.split(',').map(Number));
      const lowestY = Math.max(...pts.map(p => p[1]));
      const zeroY = +svg.querySelector('line.fc-chart__zero').getAttribute('y1');
      // Overlap check among chart texts, legend items, impact and alert paragraphs.
      const items = [
        ...[...svg.querySelectorAll('text')].map(el => ({ name: 'svg:' + el.textContent.trim(), el })),
        ...[...document.querySelectorAll('.fc-whatif__legend-item')].map(el => ({ name: 'legend:' + el.textContent.trim(), el })),
        ...[...document.querySelectorAll('.fc-section .fc-alert, .fc-whatif__impact')].map(el => ({ name: 'para:' + el.textContent.trim().slice(0, 40), el })),
      ].map(i => ({ name: i.name, r: scr(i.el) }));
      const ov = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const overlaps = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++)
        if (ov(items[i].r, items[j].r)) overlaps.push([items[i].name, items[j].name]);
      const markerLabelOverlaps = items.filter(i => i.name.startsWith('svg:') && labels.length &&
        ov(i.r, labels[0].screen) && i.name !== 'svg:' + labels[0].text).map(i => i.name);
      const svgScreen = scr(svg);
      return { viewBox: [vb.x, vb.y, vb.width, vb.height], markers, labels,
        scenarioPolylinePoints: pts.length, scenarioLowestY: lowestY, scenarioLowestIndex: pts.findIndex(p => p[1] === lowestY),
        zeroLineY: zeroY, svgScreen, overlaps, markerLabelOverlapsWithOtherSvgText: markerLabelOverlaps,
        legend: [...document.querySelectorAll('.fc-whatif__legend-item')].map(el => el.textContent.trim()) };
    });
    out.shortfallDetail = info;

    const section = page.locator('section.fc-section', { has: page.locator('.fc-chart') });
    fs.mkdirSync('screenshots', { recursive: true });
    await section.screenshot({ path: `screenshots/shortfall-${firstShort}.png` });
    out.screenshot = `screenshots/shortfall-${firstShort}.png`;
  }

  // Step 5: 360px with the shortfall delay selected (or last tested delay if none).
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(300);
  out.at360 = await page.evaluate(() => {
    const over = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > 360.5)
      .map(el => ({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').toString().slice(0, 50),
        right: +el.getBoundingClientRect().right.toFixed(1), text: el.textContent.trim().slice(0, 40) }));
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      overflowCount: over.length, overflowFirst25: over.slice(0, 25) };
  });
  out.at360Delay = await page.evaluate(() => document.querySelector('#fc-whatif-days').value);
  out.errors = out.errors;
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FAILED', e.stack || e.message); process.exit(1); });
