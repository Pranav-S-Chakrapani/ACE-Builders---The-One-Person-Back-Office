import { useState } from 'react';
import { createStore } from '../store';
import { isOverdue, todayISO } from '../domain/invoiceStatus';
import type { Invoice } from '../domain/types';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** Whole days from one YYYY-MM-DD date to another (to - from). */
function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

/** Only sent / partially paid invoices can be outstanding. */
function isOutstanding(invoice: Invoice): boolean {
  return invoice.status === 'sent' || invoice.status === 'partially_paid';
}

interface OwedRow {
  clientId: string;
  name: string;
  company?: string;
  /** Sum of balances on this client's outstanding invoices (any due date). */
  totalOutstanding: number;
  /** Sum of balances on this client's overdue invoices only. */
  overdueAmount: number;
  daysOverdue: number;
}

function WarningIcon() {
  return (
    <svg
      className="dash-badge__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 1.5 L15 14 H1 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6 V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

export default function DashboardPage() {
  const [store] = useState(createStore);

  // Repositories are read on every render, same as the Invoices page.
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const invoices = store.invoices.list();
  const payments = store.payments.list();
  const clients = store.clients.list();

  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  }
  const balanceOf = (invoice: Invoice): number =>
    Math.max(0, invoice.amount - (paidByInvoice.get(invoice.id) ?? 0));

  const outstanding = invoices.filter(isOutstanding);

  // Headline numbers (minor units / paise).
  const totalOutstanding = outstanding.reduce((sum, inv) => sum + balanceOf(inv), 0);
  const overdueAmount = outstanding
    .filter((inv) => isOverdue(inv, today))
    .reduce((sum, inv) => sum + balanceOf(inv), 0);
  const paidThisMonth = payments
    .filter((p) => p.receivedDate.startsWith(thisMonth))
    .reduce((sum, p) => sum + p.amount, 0);

  // Who owes you: one row per client with at least one outstanding invoice.
  const clientById = new Map(clients.map((c) => [c.id, c] as const));
  const rowsByClient = new Map<string, OwedRow>();
  for (const inv of outstanding) {
    let row = rowsByClient.get(inv.clientId);
    if (!row) {
      const client = clientById.get(inv.clientId);
      row = {
        clientId: inv.clientId,
        name: client?.name ?? 'Unknown client',
        company: client?.company,
        totalOutstanding: 0,
        overdueAmount: 0,
        daysOverdue: 0,
      };
      rowsByClient.set(inv.clientId, row);
    }
    const balance = balanceOf(inv);
    row.totalOutstanding += balance;
    if (isOverdue(inv, today)) {
      row.overdueAmount += balance;
      row.daysOverdue = Math.max(row.daysOverdue, daysBetween(inv.dueDate, today));
    }
  }
  const rows = [...rowsByClient.values()]
    .filter((row) => row.totalOutstanding > 0)
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        b.overdueAmount - a.overdueAmount ||
        b.totalOutstanding - a.totalOutstanding,
    );

  // Collected, last 6 calendar months ending in the current month (oldest first).
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(todayYear, todayMonth - 1 - 5 + i, 1));
    return { key: d.toISOString().slice(0, 7), label: MONTH_NAMES[d.getUTCMonth()] };
  });
  const collectedByMonth = new Map<string, number>();
  for (const p of payments) {
    const key = p.receivedDate.slice(0, 7);
    collectedByMonth.set(key, (collectedByMonth.get(key) ?? 0) + p.amount);
  }
  const bars = months.map((m) => ({ ...m, amount: collectedByMonth.get(m.key) ?? 0 }));
  const maxAmount = Math.max(0, ...bars.map((b) => b.amount));

  return (
    <div className="dash">
      <p className="dash-tagline">Your back office, in one place.</p>

      <div className="dash-cards">
        <div className="dash-card">
          <p className="dash-card__label muted">Total outstanding</p>
          <p className="dash-card__value num">{INR.format(totalOutstanding / 100)}</p>
        </div>
        <div className="dash-card">
          <p className="dash-card__label muted">Overdue</p>
          <p className="dash-card__value dash-card__value--danger num">
            {INR.format(overdueAmount / 100)}
          </p>
        </div>
        <div className="dash-card">
          <p className="dash-card__label muted">Paid this month</p>
          <p className="dash-card__value num">{INR.format(paidThisMonth / 100)}</p>
        </div>
      </div>

      <section className="dash-section" aria-labelledby="dash-owed-title">
        <h2 id="dash-owed-title" className="dash-section__title">
          Who owes you
        </h2>
        {rows.length === 0 ? (
          <p className="muted">Nothing outstanding. Nice.</p>
        ) : (
          <ul className="dash-owed">
            {rows.map((row, index) => {
              const isMostOverdue = index === 0 && row.daysOverdue > 0;
              const rowClass = isMostOverdue ? 'dash-row dash-row--top' : 'dash-row';
              return (
                <li key={row.clientId} className={rowClass}>
                  <div className="dash-row__top">
                    <span className="dash-row__who">
                      <span className="dash-row__name">{row.name}</span>
                      {row.company && <span className="dash-row__company">{row.company}</span>}
                    </span>
                    {isMostOverdue && (
                      <span className="badge dash-badge">
                        <WarningIcon />
                        Most overdue
                      </span>
                    )}
                  </div>
                  <div className="dash-row__meta">
                    <span
                      className={
                        row.daysOverdue > 0
                          ? 'dash-row__amount dash-row__amount--danger num'
                          : 'dash-row__amount num'
                      }
                    >
                      {INR.format(row.overdueAmount / 100)}
                    </span>
                    {row.daysOverdue > 0 ? (
                      <span className="dash-days dash-days--overdue">
                        Overdue by {row.daysOverdue} {row.daysOverdue === 1 ? 'day' : 'days'}
                      </span>
                    ) : (
                      <span className="dash-days muted">Not yet due</span>
                    )}
                  </div>
                  <p className="dash-row__outstanding muted">
                    {INR.format(row.totalOutstanding / 100)} outstanding
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-section" aria-labelledby="dash-chart-title">
        <h2 id="dash-chart-title" className="dash-section__title">
          Collected, last 6 months
        </h2>
        <div className="dash-chart">
          {bars.map((b) => {
            const pct = maxAmount > 0 ? Math.round((b.amount / maxAmount) * 100) : 0;
            return (
              <div key={b.key} className="dash-chart__col">
                <span className="dash-chart__value num">{INR.format(b.amount / 100)}</span>
                <div className="dash-chart__track">
                  <div className="dash-chart__bar" style={{ height: `${pct}%` }} />
                </div>
                <span className="dash-chart__month">{b.label}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
