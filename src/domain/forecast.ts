// Cash position forecast. Pure functions over plain data; no store access.
// All money is integer paise. All dates are local YYYY-MM-DD strings.

import type { BillFrequency, Client, Invoice, ISODate, Payment, RecurringBill } from './types';

/** The forecast always computes this many days (day 0 = today). */
export const FORECAST_DAYS = 90;

export interface ForecastInput {
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  recurringBills: RecurringBill[];
  /** Minor units (paise). */
  startingBalancePaise: number;
  /** Local YYYY-MM-DD; this is day 0. */
  today: ISODate;
}

export interface ForecastDay {
  date: ISODate;
  /** Projected balance at the end of this day, paise. */
  balance: number;
}

export interface ForecastEvent {
  date: ISODate;
  label: string;
  /** Positive paise. */
  amount: number;
  kind: 'inflow' | 'outflow';
}

export interface ForecastResult {
  /** Exactly FORECAST_DAYS points, day 0 first. */
  days: ForecastDay[];
  /** Total inflows over the full 90-day horizon, paise. */
  inflows: number;
  /** Total outflows over the full 90-day horizon, paise. */
  outflows: number;
  /** First date in the horizon where the balance is below zero. */
  shortfallDate?: ISODate;
  /** Sorted by date. */
  events: ForecastEvent[];
}

const DAY_MS = 86_400_000;

function splitDate(date: ISODate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function formatUTC(ms: number): ISODate {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Adds whole days to a YYYY-MM-DD date. Timezone-safe: works in UTC parts only. */
export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = splitDate(date);
  return formatUTC(Date.UTC(y, m - 1, d + days));
}

/** Adds whole months, keeping the day of month and clamping to the month end. */
function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = splitDate(date);
  const total = m - 1 + months;
  const targetYear = y + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatUTC(Date.UTC(targetYear, targetMonth, Math.min(d, lastDay)));
}

/** The k-th occurrence of a bill, counted from its nextDueDate (k = 0 is the start). */
function occurrence(start: ISODate, frequency: BillFrequency, k: number): ISODate {
  if (frequency === 'weekly') return addDays(start, 7 * k);
  if (frequency === 'monthly') return addMonths(start, k);
  if (frequency === 'quarterly') return addMonths(start, 3 * k);
  return addMonths(start, 12 * k); // yearly
}

export function computeForecast(input: ForecastInput): ForecastResult {
  const { clients, invoices, payments, recurringBills, startingBalancePaise, today } = input;
  const end = addDays(today, FORECAST_DAYS - 1);
  const inWindow = (date: ISODate): boolean => date >= today && date <= end;

  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  }
  const balanceOf = (invoice: Invoice): number =>
    Math.max(0, invoice.amount - (paidByInvoice.get(invoice.id) ?? 0));

  const clientById = new Map(clients.map((c) => [c.id, c] as const));
  const events: ForecastEvent[] = [];

  // Inflow A: existing unpaid invoices, counted on their due date.
  // Invoices already past due are counted on day 0 (today).
  for (const inv of invoices) {
    if (inv.status !== 'sent' && inv.status !== 'partially_paid') continue;
    const balance = balanceOf(inv);
    if (balance <= 0) continue;
    const date = inv.dueDate < today ? today : inv.dueDate;
    if (!inWindow(date)) continue;
    const clientName = clientById.get(inv.clientId)?.name ?? 'Unknown client';
    events.push({ date, label: `${clientName} · ${inv.number}`, amount: balance, kind: 'inflow' });
  }

  // Inflow B: next 3 monthly invoices for active retainer clients, projected.
  for (const client of clients) {
    if (client.kind !== 'retainer' || client.status !== 'active') continue;
    const monthly = client.monthlyRetainerAmount ?? 0;
    if (monthly <= 0) continue;

    const own = invoices.filter((inv) => inv.clientId === client.id);
    // Anchor: the most recent issue date for this client, else today.
    const anchor = own.reduce<ISODate>((latest, inv) => (inv.issueDate > latest ? inv.issueDate : latest), '');
    const base = anchor === '' ? today : anchor;
    // Calendar months already invoiced; a projection in one of these is skipped.
    const invoicedMonths = new Set(own.map((inv) => inv.issueDate.slice(0, 7)));

    for (let k = 1; k <= 3; k++) {
      const issueDate = addMonths(base, k);
      if (invoicedMonths.has(issueDate.slice(0, 7))) continue;
      const dueDate = addDays(issueDate, client.paymentTermsDays);
      if (!inWindow(dueDate)) continue;
      events.push({ date: dueDate, label: `${client.name} · retainer (projected)`, amount: monthly, kind: 'inflow' });
    }
  }

  // Outflow: active recurring bills, each occurrence on or after today within the horizon.
  for (const bill of recurringBills) {
    if (!bill.active) continue;
    for (let k = 0; ; k++) {
      const date = occurrence(bill.nextDueDate, bill.frequency, k);
      if (date > end) break;
      if (date >= today) {
        events.push({ date, label: bill.name, amount: bill.amount, kind: 'outflow' });
      }
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

  const inflowByDay = new Map<ISODate, number>();
  const outflowByDay = new Map<ISODate, number>();
  let inflows = 0;
  let outflows = 0;
  for (const e of events) {
    const bucket = e.kind === 'inflow' ? inflowByDay : outflowByDay;
    bucket.set(e.date, (bucket.get(e.date) ?? 0) + e.amount);
    if (e.kind === 'inflow') inflows += e.amount;
    else outflows += e.amount;
  }

  // Daily running balance, day 0 through day 89.
  const days: ForecastDay[] = [];
  let running = startingBalancePaise;
  let shortfallDate: ISODate | undefined;
  for (let d = 0; d < FORECAST_DAYS; d++) {
    const date = addDays(today, d);
    running += (inflowByDay.get(date) ?? 0) - (outflowByDay.get(date) ?? 0);
    days.push({ date, balance: running });
    if (running < 0 && shortfallDate === undefined) shortfallDate = date;
  }

  return { days, inflows, outflows, shortfallDate, events };
}

/** Clients with at least one sent or partially paid invoice whose unpaid balance is above zero. Sorted by name. */
export function clientsWithOutstanding(clients: Client[], invoices: Invoice[], payments: Payment[]): Client[] {
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  }
  const withBalance = new Set(
    invoices
      .filter(
        (inv) =>
          (inv.status === 'sent' || inv.status === 'partially_paid') &&
          inv.amount - (paidByInvoice.get(inv.id) ?? 0) > 0,
      )
      .map((inv) => inv.clientId),
  );
  return clients.filter((c) => withBalance.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** A "client pays late" what-if: every unpaid invoice for one client is due `days` later. */
export interface ClientDelayScenario {
  clientId: string;
  /** Whole days, 0 or more. */
  days: number;
}

/**
 * Returns a copy of the input with the due date of each unpaid (sent or partially paid)
 * invoice for the client moved later by `days`, using addDays. Overdue invoices shift from
 * their stored due date. Recurring bills, payments and other clients are unchanged.
 * Stored data is not mutated; pass the result to computeForecast, which applies the same rules.
 */
export function applyClientDelay(input: ForecastInput, scenario: ClientDelayScenario): ForecastInput {
  if (scenario.days === 0) return input;
  const invoices = input.invoices.map((inv) =>
    inv.clientId === scenario.clientId && (inv.status === 'sent' || inv.status === 'partially_paid')
      ? { ...inv, dueDate: addDays(inv.dueDate, scenario.days) }
      : inv,
  );
  return { ...input, invoices };
}

