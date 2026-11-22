import type { Invoice, InvoiceStatus } from './types';

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'muted';

export interface DisplayStatus {
  label: string;
  tone: StatusTone;
  daysLate?: number;
}

const DAY_MS = 86_400_000;

const STORED_LABELS: Record<InvoiceStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  partially_paid: { label: 'Part paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Void', tone: 'muted' },
};

/** True for a YYYY-MM-DD calendar date string. */
export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parses YYYY-MM-DD as UTC midnight so day arithmetic ignores timezone and DST. */
function utcMillis(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Overdue is derived, never stored: unpaid-but-sent and past due date. */
export function isOverdue(invoice: Invoice, today: string): boolean {
  return (invoice.status === 'sent' || invoice.status === 'partially_paid') && invoice.dueDate < today;
}

/** Open is derived, never stored: unpaid-but-sent and not yet past due (due today or later). */
export function isOpen(invoice: Invoice, today: string): boolean {
  return (invoice.status === 'sent' || invoice.status === 'partially_paid') && invoice.dueDate >= today;
}

/** Today's LOCAL date as YYYY-MM-DD (not UTC). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Adds whole days to a YYYY-MM-DD date. Caller must pass a valid ISO date. */
export function addDays(date: string, days: number): string {
  return new Date(utcMillis(date) + days * DAY_MS).toISOString().slice(0, 10);
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Status shown to the user, with overdue derived at read time.
 * paidMinor is the sum of this invoice's payments in paise; when an overdue
 * invoice has payments, the label shows how much has been paid.
 */
export function displayStatus(invoice: Invoice, today: string, paidMinor?: number): DisplayStatus {
  if (isOverdue(invoice, today)) {
    const daysLate = Math.round((utcMillis(today) - utcMillis(invoice.dueDate)) / DAY_MS);
    const base = `Overdue · ${daysLate} ${daysLate === 1 ? 'day' : 'days'}`;
    const label =
      paidMinor && paidMinor > 0
        ? `${base} (${INR.format(paidMinor / 100)} of ${INR.format(invoice.amount / 100)} paid)`
        : base;
    return {
      label,
      tone: 'danger',
      daysLate,
    };
  }
  return { ...STORED_LABELS[invoice.status] };
}
