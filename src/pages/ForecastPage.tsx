import { useState, type FormEvent } from 'react';
import { createStore } from '../store';
import { todayISO } from '../domain/invoiceStatus';
import {
  FORECAST_DAYS,
  addDays,
  applyClientDelay,
  clientsWithOutstanding,
  computeForecast,
  type ForecastDay,
  type ForecastInput,
} from '../domain/forecast';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WINDOWS = [30, 60, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

const DEFAULT_DELAY = 15;
const MAX_DELAY = 120;

// Chart geometry (SVG user units; the SVG scales to its container width).
const W = 360;
const H = 220;
const PAD_L = 62;
const PAD_R = 10;
const PAD_T = 14;
const PAD_B = 26;

/** "12 Dec" from a YYYY-MM-DD date. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

/** Compact rupee label for chart axes, e.g. ₹1.5L, ₹40k, -₹5k. Input is paise. */
function axisLabel(paise: number): string {
  const rupees = Math.round(paise / 100);
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
  if (abs >= 1_000) return `${sign}₹${Math.round(abs / 1_000)}k`;
  return `${sign}₹${abs}`;
}

/** Parses a rupee string ("140000", "1,40,000.50") to integer paise, or null if invalid. */
function parseRupees(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,\s₹]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** "day" or "days" for a count. */
function dayWord(n: number): string {
  return n === 1 ? 'day' : 'days';
}

/** Index of the first lowest balance in a series. */
function lowestIndex(points: ForecastDay[]): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].balance < points[best].balance) best = i;
  }
  return best;
}

interface ChartProps {
  points: ForecastDay[];
  shortfallIndex: number;
  /** Optional what-if series, drawn dashed over the baseline. */
  scenario?: { points: ForecastDay[]; shortfallIndex: number };
}

function ForecastChart({ points, shortfallIndex, scenario }: ChartProps) {
  const n = points.length;
  const values = points.map((p) => p.balance);
  const scenarioValues = scenario ? scenario.points.map((p) => p.balance) : [];
  const lo = Math.min(0, ...values, ...scenarioValues);
  const hi = Math.max(0, ...values, ...scenarioValues);
  const span = hi - lo || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (i: number): number => PAD_L + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number): number => PAD_T + (1 - (v - lo) / span) * plotH;

  const polyline = (series: ForecastDay[]): string =>
    series.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const yTicks = [0, 1, 2, 3].map((t) => lo + (span * t) / 3);
  const zeroY = y(0);

  // Four x-axis labels: first, last and two evenly between.
  const xIndexes = [...new Set([0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])];

  /** Red shortfall marker with its date label, for one series. */
  const renderMarker = (series: ForecastDay[], index: number) => {
    const point = index >= 0 ? series[index] : undefined;
    if (!point) return null;
    const markerX = x(index);
    const markerY = y(point.balance);
    const markerLabelY = markerY < 40 ? markerY + 20 : markerY - 12;
    return (
      <g>
        <circle className="fc-chart__marker" cx={markerX} cy={markerY} r={5} />
        <text className="fc-chart__marker-label" x={markerX} y={markerLabelY} textAnchor="middle">
          {shortDate(point.date)}
        </text>
      </g>
    );
  };

  return (
    <svg
      className="fc-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Projected cash balance for the next ${n} days`}
    >
      {yTicks.map((v) => (
        <text key={v} className="fc-chart__axis" x={PAD_L - 6} y={y(v) + 4} textAnchor="end">
          {axisLabel(v)}
        </text>
      ))}
      <line
        className="fc-chart__zero"
        x1={PAD_L}
        x2={W - PAD_R}
        y1={zeroY}
        y2={zeroY}
      />
      <text className="fc-chart__axis" x={W - PAD_R} y={zeroY - 4} textAnchor="end">
        ₹0
      </text>
      <polyline className="fc-chart__line" points={polyline(points)} />
      {scenario && (
        <polyline className="fc-chart__line fc-chart__line--scenario" points={polyline(scenario.points)} />
      )}
      {xIndexes.map((i) => (
        <text
          key={i}
          className="fc-chart__axis"
          x={x(i)}
          y={H - 6}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
        >
          {shortDate(points[i].date)}
        </text>
      ))}
      {renderMarker(points, shortfallIndex)}
      {scenario && renderMarker(scenario.points, scenario.shortfallIndex)}
    </svg>
  );
}

export default function ForecastPage() {
  const [store] = useState(createStore);
  const [windowDays, setWindowDays] = useState<WindowDays>(90);
  // What-if scenario: '' means baseline only.
  const [clientId, setClientId] = useState('');
  const [delay, setDelay] = useState(DEFAULT_DELAY);

  // Repositories are read on every render, same as the other pages.
  const today = todayISO();
  const settings = store.settings.get();
  const [draft, setDraft] = useState(() => INR.format(settings.startingBalance / 100));
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const clients = store.clients.list();
  const invoices = store.invoices.list();
  const payments = store.payments.list();
  const input: ForecastInput = {
    clients,
    invoices,
    payments,
    recurringBills: store.recurringBills.list(),
    startingBalancePaise: settings.startingBalance,
    today,
  };
  const forecast = computeForecast(input);

  // Only clients with an unpaid invoice can be picked in the what-if panel.
  const payingClients = clientsWithOutstanding(clients, invoices, payments);
  const scenarioClient = payingClients.find((c) => c.id === clientId);
  const scenarioForecast = scenarioClient
    ? computeForecast(applyClientDelay(input, { clientId: scenarioClient.id, days: delay }))
    : undefined;

  function saveBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const paise = parseRupees(draft);
    if (paise === null) {
      setBalanceError('Enter rupees, up to 2 decimals (for example 140000 or 1,40,000.50).');
      return;
    }
    store.settings.set({ startingBalance: paise });
    setBalanceError(null);
    setDraft(INR.format(paise / 100));
  }

  function pickClient(id: string) {
    setClientId(id);
    setDelay(DEFAULT_DELAY);
  }

  function changeDelay(raw: string) {
    if (raw.trim() === '') return;
    const n = Math.round(Number(raw));
    if (Number.isNaN(n)) return;
    setDelay(Math.min(MAX_DELAY, Math.max(0, n)));
  }

  function resetScenario() {
    setClientId('');
    setDelay(DEFAULT_DELAY);
  }

  const windowEnd = addDays(today, windowDays - 1);
  const windowPoints = forecast.days.slice(0, windowDays);
  const shortfallIndex = windowPoints.findIndex((d) => d.balance < 0);
  const shortfall = shortfallIndex >= 0 ? windowPoints[shortfallIndex] : undefined;

  const windowEvents = forecast.events.filter((e) => e.date <= windowEnd);
  const inflowTotal = windowEvents
    .filter((e) => e.kind === 'inflow')
    .reduce((sum, e) => sum + e.amount, 0);
  const outflowTotal = windowEvents
    .filter((e) => e.kind === 'outflow')
    .reduce((sum, e) => sum + e.amount, 0);
  const billEvents = windowEvents.filter((e) => e.kind === 'outflow');

  const day30 = forecast.days[30];
  const day60 = forecast.days[60];
  const day89 = forecast.days[FORECAST_DAYS - 1];
  const summary = [
    { label: `Day 30 · ${shortDate(day30.date)}`, balance: day30.balance },
    { label: `Day 60 · ${shortDate(day60.date)}`, balance: day60.balance },
    { label: `Day 89 · ${shortDate(day89.date)}`, balance: day89.balance },
  ];

  // What-if: scenario series over the same window, its shortfall, and the impact line.
  const scenarioPoints = scenarioForecast?.days.slice(0, windowDays);
  const scenarioShortfallIndex = scenarioPoints ? scenarioPoints.findIndex((d) => d.balance < 0) : -1;
  const scenarioShortfall =
    scenarioPoints && scenarioShortfallIndex >= 0 ? scenarioPoints[scenarioShortfallIndex] : undefined;
  const scenarioChart = scenarioPoints ? { points: scenarioPoints, shortfallIndex: scenarioShortfallIndex } : undefined;
  const delayLabel = `Pays ${delay} ${dayWord(delay)} late`;

  let impact: string | null = null;
  let scenarioStatus: string | null = null;
  if (scenarioClient && scenarioPoints) {
    const baseIdx = lowestIndex(windowPoints);
    const scenIdx = lowestIndex(scenarioPoints);
    const base = windowPoints[baseIdx];
    const scen = scenarioPoints[scenIdx];
    if (scenarioShortfall) {
      // Primary fact matches the status line: the first day the scenario balance is below zero.
      // The eventual lowest point is added only when it falls on a later date.
      const further =
        scen.date > scenarioShortfall.date
          ? `, and falls further to ${INR.format(scen.balance / 100)} by ${shortDate(scen.date)}`
          : '';
      impact = `This pushes your balance below zero on ${shortDate(scenarioShortfall.date)} (balance: ${INR.format(scenarioShortfall.balance / 100)})${further}.`;
    } else if (scen.balance === base.balance && scenIdx === baseIdx) {
      impact = `This delay does not change your lowest projected balance (${INR.format(base.balance / 100)} on ${shortDate(base.date)}).`;
    } else {
      // Positive shift = the scenario low point comes earlier than the current plan's.
      const shift = baseIdx - scenIdx;
      if (shift === 0) {
        const drop = base.balance - scen.balance;
        impact = `This pushes your lowest projected balance down to ${INR.format(scen.balance / 100)} on ${shortDate(scen.date)} — the same date as your current plan (${INR.format(drop / 100)} lower, no days earlier).`;
      } else {
        const timing =
          shift > 0 ? `${shift} ${dayWord(shift)} earlier` : `${-shift} ${dayWord(-shift)} later`;
        impact = `This pushes your lowest projected balance to ${INR.format(scen.balance / 100)} on ${shortDate(scen.date)} — ${timing} than your current plan.`;
      }
    }
    if (!scenarioShortfall) {
      scenarioStatus = `Still positive: lowest ${INR.format(scen.balance / 100)} on ${shortDate(scen.date)}`;
    }
  }

  return (
    <div className="fc">
      <form className="fc-balance" onSubmit={saveBalance} noValidate>
        <div className="field">
          <label htmlFor="fc-starting-balance">Starting balance (₹)</label>
          <input
            id="fc-starting-balance"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={balanceError ? true : undefined}
            aria-describedby={balanceError ? 'fc-starting-balance-error' : undefined}
          />
          {balanceError && (
            <p id="fc-starting-balance-error" className="field-error">
              {balanceError}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary">
            Save balance
          </button>
        </div>
      </form>

      <div className="fc-toggle" role="group" aria-label="Forecast window">
        {WINDOWS.map((n) => {
          const active = n === windowDays;
          return (
            <button
              key={n}
              type="button"
              className={active ? 'fc-toggle__btn fc-toggle__btn--active' : 'fc-toggle__btn'}
              aria-pressed={active}
              onClick={() => setWindowDays(n)}
            >
              {n} days
            </button>
          );
        })}
      </div>

      <div className="fc-cards">
        {summary.map((s) => (
          <div key={s.label} className="fc-card">
            <p className="fc-card__label muted">{s.label}</p>
            <p
              className={
                s.balance < 0 ? 'fc-card__value fc-card__value--danger num' : 'fc-card__value num'
              }
            >
              {INR.format(s.balance / 100)}
            </p>
          </div>
        ))}
      </div>

      {shortfall ? (
        <p className="fc-alert" role="alert">
          <span className="fc-alert__dot" aria-hidden="true" />
          Cash shortfall expected around {shortDate(shortfall.date)}
        </p>
      ) : (
        <p className="fc-ok muted">No shortfall in the next {windowDays} days</p>
      )}

      <section className="fc-whatif" aria-labelledby="fc-whatif-title">
        <h2 id="fc-whatif-title" className="fc-section__title">
          What if a client pays late?
        </h2>
        <div className="fc-whatif__controls">
          <div className="field">
            <label htmlFor="fc-whatif-client">Client</label>
            <select
              id="fc-whatif-client"
              className="fc-whatif__select"
              value={clientId}
              onChange={(e) => pickClient(e.target.value)}
            >
              <option value="">None</option>
              {payingClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fc-whatif-days">{delayLabel}</label>
            <div className="fc-whatif__delay">
              <input
                id="fc-whatif-slider"
                className="fc-whatif__slider"
                type="range"
                min={0}
                max={MAX_DELAY}
                step={1}
                value={delay}
                disabled={!scenarioClient}
                aria-label={delayLabel}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
              <input
                id="fc-whatif-days"
                className="fc-whatif__days num"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_DELAY}
                step={1}
                value={delay}
                disabled={!scenarioClient}
                onChange={(e) => changeDelay(e.target.value)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={resetScenario} disabled={clientId === ''}>
              Reset scenario
            </button>
          </div>
        </div>
      </section>

      <section className="fc-section" aria-labelledby="fc-chart-title">
        <h2 id="fc-chart-title" className="fc-section__title">
          Projected balance, next {windowDays} days
        </h2>
        {impact && <p className="fc-whatif__impact">{impact}</p>}
        {scenarioClient && scenarioShortfall && (
          <p className="fc-alert">
            <span className="fc-alert__dot" aria-hidden="true" />
            {`Cash shortfall expected around ${shortDate(scenarioShortfall.date)} (balance: ${INR.format(scenarioShortfall.balance / 100)}) if ${scenarioClient.name} pays ${delay} ${dayWord(delay)} late.`}
          </p>
        )}
        {scenarioStatus && <p className="fc-ok muted">{scenarioStatus}</p>}
        <div className="fc-chart-wrap">
          <ForecastChart points={windowPoints} shortfallIndex={shortfallIndex} scenario={scenarioChart} />
        </div>
        <ul className="fc-whatif__legend">
          <li className="fc-whatif__legend-item">
            <span className="fc-whatif__swatch" aria-hidden="true" />
            Current plan
          </li>
          {scenarioClient && scenarioPoints && (
            <li className="fc-whatif__legend-item">
              <span className="fc-whatif__swatch fc-whatif__swatch--scenario" aria-hidden="true" />
              If {scenarioClient.name} pays {delay} {dayWord(delay)} late
            </li>
          )}
        </ul>
      </section>

      <section className="fc-section" aria-label="Breakdown">
        <div className="fc-totals">
          <div className="fc-total">
            <span>Inflows (next {windowDays} days)</span>
            <span className="fc-total__value num">{INR.format(inflowTotal / 100)}</span>
          </div>
          <div className="fc-total">
            <span>Outflows (next {windowDays} days)</span>
            <span className="fc-total__value num">{INR.format(outflowTotal / 100)}</span>
          </div>
        </div>

        <h2 className="fc-section__title">Recurring bills due</h2>
        {billEvents.length === 0 ? (
          <p className="muted">No recurring bills due in this window.</p>
        ) : (
          <ul className="fc-list">
            {billEvents.map((e, i) => (
              <li key={`${e.date}-${e.label}-${i}`} className="fc-list__row">
                <span className="fc-list__date num">{shortDate(e.date)}</span>
                <span className="fc-list__name">{e.label}</span>
                <span className="num">{INR.format(e.amount / 100)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="fc-note muted">
        Assumes on-time payment. Unpaid invoices count on their due date; invoices already overdue
        count today. Each retainer client&apos;s next 3 monthly invoices are projected from their
        latest invoice date plus payment terms, skipping any month already invoiced. Recurring bills
        count on each due date. The what-if moves only the chosen client&apos;s unpaid invoices later;
        projected retainer invoices and recurring bills stay as in the current plan.
      </p>
    </div>
  );
}
