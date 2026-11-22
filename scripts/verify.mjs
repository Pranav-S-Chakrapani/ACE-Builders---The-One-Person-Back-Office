// Browser verification for ClearDue. Run with: npm run verify
// Starts the Vite dev server only if BASE_URL is not already answering.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');
const WIDTHS = [1280, 360];
const HEIGHT = 800;
const TABS = ['dashboard', 'invoices', 'forecast', 'today'];
const STORAGE_KEY = 'cleardue:v1';

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(`CD-${String(i).padStart(4, '0')}`);
  return out;
}

const EXPECTED_FILTERS = {
  All: range(1, 20),
  Open: ['CD-0016', 'CD-0017'],
  Overdue: range(12, 15),
  Paid: range(1, 11),
  Draft: ['CD-0018', 'CD-0019'],
};
const EXPECTED_COUNTS = { invoices: 20, clients: 7, payments: 12, recurringBills: 7, reminders: 2 };
const EXPECTED_BALANCE_PAISE = 3000000; // CD-0012: 6000000 amount minus one 3000000 payment

const inrFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const normalise = (s) => s.replace(/\s/g, ' ').trim();
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function answers() {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await answers()) return null;
  console.log(`No answer from ${BASE_URL}; starting vite.`);
  const child = spawn('npx vite --port 5173 --strictPort', {
    shell: true,
    cwd: ROOT,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await answers()) return child;
    await sleep(500);
  }
  stopServer(child);
  throw new Error('vite did not answer within 30 s');
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function openPage(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { context, page, errors };
}

async function gotoRoute(page, route) {
  await page.goto(`${BASE_URL}/#/${route}`, { waitUntil: 'load' });
  await page.locator('nav.tabs').waitFor();
  await page.waitForTimeout(300);
}

async function applyFilter(page, label) {
  await page.locator('.chips').getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(300);
  const texts = await page.locator('.inv-table tbody tr td:first-child').allInnerTexts();
  return texts
    .map((t) => t.trim())
    .filter((t) => /^CD-\d{4}$/.test(t))
    .sort();
}

async function readCounts(page) {
  return page.evaluate((key) => {
    const d = JSON.parse(localStorage.getItem(key));
    return {
      invoices: d.invoices.length,
      clients: d.clients.length,
      payments: d.payments.length,
      recurringBills: d.recurringBills.length,
      reminders: d.reminders.length,
    };
  }, STORAGE_KEY);
}

async function check1(browser) {
  const lines = [];
  let pass = true;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  for (const width of WIDTHS) {
    const { context, page, errors } = await openPage(browser, width);
    try {
      for (const tab of TABS) {
        errors.length = 0;
        await gotoRoute(page, tab);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${width}-${tab}.png`),
          fullPage: true,
        });
        const ok = errors.length === 0 && scrollWidth <= width;
        pass = pass && ok;
        const errText = errors.length ? ` ${JSON.stringify(errors)}` : '';
        lines.push(
          `  ${width}px #/${tab}: console errors=${errors.length}${errText}; ` +
            `scrollWidth=${scrollWidth} viewport=${width}`,
        );
      }
    } finally {
      await context.close();
    }
  }
  return { pass, lines };
}

async function check2and4(page) {
  const lines = [];
  const observed = {};
  let pass = true;
  await gotoRoute(page, 'invoices');
  for (const label of Object.keys(EXPECTED_FILTERS)) {
    const rows = await applyFilter(page, label);
    observed[label] = rows;
    const ok = sameList(rows, EXPECTED_FILTERS[label]);
    pass = pass && ok;
    lines.push(`  ${label}: ${rows.length} rows ${JSON.stringify(rows)} ${ok ? 'matches' : 'DIFFERS from expected'}`);
  }
  return { pass, observed, lines };
}

async function check3(page) {
  await applyFilter(page, 'All');
  await page.locator('.inv-table').getByRole('link', { name: 'CD-0012', exact: true }).click();
  await page.locator('section.detail').waitFor();
  await page.waitForTimeout(300);

  const field = async (term) =>
    normalise(
      await page
        .locator('dl.detail-grid div', { has: page.locator('dt', { hasText: new RegExp(`^${term}$`) }) })
        .locator('dd')
        .innerText(),
    );
  const amount = await field('Amount');
  const balance = await field('Balance remaining');
  const status = normalise(await page.locator('.page-head .badge').innerText());
  const payments = (
    await page
      .locator('section.panel', { has: page.locator('h2', { hasText: 'Payments received' }) })
      .locator('ul.plain-list li')
      .allInnerTexts()
  ).map(normalise);
  const expectedBalance = inrFormat.format(EXPECTED_BALANCE_PAISE / 100);
  const pass = balance === expectedBalance;
  return {
    pass,
    lines: [
      `  amount: ${amount}`,
      `  payments: ${JSON.stringify(payments)}`,
      `  balance: ${balance} (expected ${expectedBalance})`,
      `  status: ${status}`,
    ],
  };
}

async function check4(observed) {
  const listedIn = Object.keys(EXPECTED_FILTERS).filter(
    (label) => label !== 'All' && observed[label].includes('CD-0020'),
  );
  const inAll = observed.All.includes('CD-0020');
  const pass = listedIn.length === 0 && inAll;
  return {
    pass,
    lines: [`  CD-0020 listed under: ${JSON.stringify(listedIn)}; under All: ${inAll}`],
  };
}

async function check5(page) {
  const before = await readCounts(page);
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('.footer__reset').click(),
  ]);
  await gotoRoute(page, 'invoices');
  const after = await readCounts(page);
  const allRows = await applyFilter(page, 'All');
  const countsOk = Object.keys(EXPECTED_COUNTS).every((k) => after[k] === EXPECTED_COUNTS[k]);
  const listOk = sameList(allRows, EXPECTED_FILTERS.All);
  const pass = countsOk && listOk;
  return {
    pass,
    lines: [
      `  counts before reset: ${JSON.stringify(before)}`,
      `  counts after reset: ${JSON.stringify(after)} (expected ${JSON.stringify(EXPECTED_COUNTS)})`,
      `  All list after reset: ${allRows.length} rows ${JSON.stringify(allRows)}`,
    ],
  };
}

async function runCheck(n, fn) {
  try {
    const result = await fn();
    console.log(`CHECK ${n} ${result.pass ? 'PASS' : 'FAIL'}`);
    for (const line of result.lines ?? []) console.log(line);
    return result;
  } catch (err) {
    console.log(`CHECK ${n} FAIL`);
    console.log(`  error: ${err.message}`);
    return { pass: false };
  }
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const outcomes = [];
  try {
    outcomes.push(await runCheck(1, () => check1(browser)));

    const { context, page } = await openPage(browser, 1280);
    try {
      const c2 = await runCheck(2, () => check2and4(page));
      outcomes.push(c2);
      const observed = c2.observed ?? {};
      outcomes.push(await runCheck(3, () => check3(page)));
      outcomes.push(await runCheck(4, () => check4(observed)));
      outcomes.push(await runCheck(5, () => check5(page)));
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    stopServer(server);
  }

  const allPass = outcomes.every((o) => o.pass);
  console.log(allPass ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
  process.exitCode = allPass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
