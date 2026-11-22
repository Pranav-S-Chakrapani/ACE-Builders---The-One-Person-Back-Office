import { useEffect, useMemo, useRef, useState } from 'react';
import { createStore } from '../store';
import { computeForecast } from '../domain/forecast';
import { addDays, isOverdue, todayISO } from '../domain/invoiceStatus';
import { draftFallback, draftReminder, pickTone, type ReminderMode, type Tone } from '../domain/reminders';
import { now } from '../domain/ids';

type Store = ReturnType<typeof createStore>;
type Invoice = ReturnType<Store['invoices']['list']>[number];
type Client = ReturnType<Store['clients']['list']>[number];
type Payment = ReturnType<Store['payments']['list']>[number];
type Bill = ReturnType<Store['recurringBills']['list']>[number];

interface InvoiceAction {
  kind: 'overdue' | 'due_soon';
  key: string;
  headline: string;
  detail: string;
  invoice: Invoice;
  clientName: string;
  balance: number;
  daysLate: number;
  dueDate: string;
  mode: ReminderMode;
}

interface BillAction {
  kind: 'bill';
  key: string;
  billId: string;
  date: string;
  headline: string;
  detail: string;
}

type Action = InvoiceAction | BillAction;

const TONE_LABEL: Record<Tone, string> = {
  gentle: 'gentle nudge',
  firm: 'firm follow-up',
  final: 'final notice',
};

const BADGE_LABEL: Record<Action['kind'], string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  bill: 'Bill',
};

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function money(paise: number): string {
  return inr.format(paise / 100);
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86400000);
}

function shortDate(s: string): string {
  return parseISO(s).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function addMonths(s: string, n: number): string {
  const d = parseISO(s);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const total = m + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(ny, nm, Math.min(day, lastDay))));
}

function stepBill(start: string, frequency: string, k: number): string {
  switch (frequency) {
    case 'weekly':
      return addDays(start, 7 * k);
    case 'quarterly':
      return addMonths(start, 3 * k);
    case 'yearly':
      return addMonths(start, 12 * k);
    case 'monthly':
    default:
      return addMonths(start, k);
  }
}

// First occurrence on or after today, but only if it falls within 90 days.
function nextOccurrence(start: string, frequency: string, today: string): string | null {
  const limit = addDays(today, 90);
  for (let k = 0; k < 1000; k++) {
    const occ = stepBill(start, frequency, k);
    if (occ >= today) {
      return occ > limit ? null : occ;
    }
  }
  return null;
}

function balanceOf(invoice: Invoice, payments: Payment[]): number {
  const paid = payments
    .filter((p) => p.invoiceId === invoice.id)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, invoice.amount - paid);
}

function buildQueue(store: Store, today: string): Action[] {
  const clients = store.clients.list();
  const invoices = store.invoices.list();
  const payments = store.payments.list();
  const bills: Bill[] = store.recurringBills.list();
  const settings = store.settings.get();

  const clientById = new Map<string, Client>(clients.map((c) => [c.id, c]));
  const clientNameOf = (inv: Invoice) => clientById.get(inv.clientId)?.name ?? 'customer';
  const companyOf = (inv: Invoice) => {
    const c = clientById.get(inv.clientId);
    return c?.company ? `${c.company} · ${inv.number}` : inv.number;
  };

  const outstanding = invoices
    .map((inv) => ({ inv, bal: balanceOf(inv, payments) }))
    .filter(
      ({ inv, bal }) =>
        (inv.status === 'sent' || inv.status === 'partially_paid') && bal > 0,
    );

  // a. Overdue
  const overdue: InvoiceAction[] = outstanding
    .filter(({ inv }) => isOverdue(inv, today))
    .map(({ inv, bal }) => {
      const daysLate = diffDays(inv.dueDate, today);
      const name = clientNameOf(inv);
      return {
        kind: 'overdue' as const,
        key: `overdue-${inv.id}`,
        headline: `Chase ${name} — ${money(bal)} overdue by ${daysLate} ${daysLate === 1 ? 'day' : 'days'}`,
        detail: companyOf(inv),
        invoice: inv,
        clientName: name,
        balance: bal,
        daysLate,
        dueDate: inv.dueDate,
        mode: 'overdue' as const,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate || b.balance - a.balance);

  // b. Due soon (today through today + 3 days, inclusive)
  const soonLimit = addDays(today, 3);
  const dueSoon: InvoiceAction[] = outstanding
    .filter(({ inv }) => inv.dueDate >= today && inv.dueDate <= soonLimit)
    .sort((a, b) => (a.inv.dueDate < b.inv.dueDate ? -1 : a.inv.dueDate > b.inv.dueDate ? 1 : 0))
    .map(({ inv, bal }) => {
      const n = diffDays(today, inv.dueDate);
      const name = clientNameOf(inv);
      const when =
        n === 0 ? 'due today' : `due in ${n} ${n === 1 ? 'day' : 'days'}`;
      return {
        kind: 'due_soon' as const,
        key: `due-${inv.id}`,
        headline: `${name} — ${money(bal)} ${when}`,
        detail: companyOf(inv),
        invoice: inv,
        clientName: name,
        balance: bal,
        daysLate: -n,
        dueDate: inv.dueDate,
        mode: 'due_soon' as const,
      };
    });

  // c. Bills at risk (max 3)
  const forecast = computeForecast({
    clients,
    invoices,
    payments,
    recurringBills: bills,
    startingBalancePaise: settings.startingBalance,
    today,
  });
  const shortfall = forecast.shortfallDate;

  const billActions: BillAction[] = [];
  for (const bill of bills) {
    if (!bill.active) continue;
    const occ = nextOccurrence(bill.nextDueDate, bill.frequency, today);
    if (!occ) continue;
    const atRisk = shortfall ? occ <= shortfall : diffDays(today, occ) <= 14;
    if (!atRisk) continue;
    billActions.push({
      kind: 'bill',
      key: `bill-${bill.id}`,
      billId: bill.id,
      date: occ,
      headline: `Pay ${bill.name} — ${money(bill.amount)} due ${shortDate(occ)}`,
      detail: bill.category ?? 'Recurring bill',
    });
  }
  billActions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return [...overdue, ...dueSoon, ...billActions.slice(0, 3)];
}

interface DraftPanelProps {
  action: InvoiceAction;
  store: Store;
  onSent: () => void;
}

function DraftPanel({ action, store, onSent }: DraftPanelProps) {
  const tone = pickTone(action.daysLate, action.mode);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyNote, setCopyNote] = useState('');
  const [draftError, setDraftError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    const input = {
      clientName: action.clientName,
      invoiceNumber: action.invoice.number,
      balance: action.balance,
      daysLate: action.daysLate,
      dueDate: action.dueDate,
      businessName: store.settings.get().businessName,
      mode: action.mode,
    };
    setLoading(true);
    setDraftError(false);
    draftReminder(input)
      .then((draft) => {
        if (!cancelled) setText(draft);
      })
      .catch(() => {
        if (cancelled) return;
        try {
          setText(draftFallback(input));
        } catch {
          setText('');
          setDraftError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [action, store]);

  async function copyText() {
    const el = textareaRef.current;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(el?.value ?? text);
      setCopied(true);
      setCopyNote('');
    } catch {
      el?.select();
      setCopied(false);
      setCopyNote('Select the text and copy it manually.');
    }
  }

  function markSent() {
    store.reminders.create({
      targetType: 'invoice',
      targetId: action.invoice.id,
      dueAt: now(),
      channel: 'whatsapp',
      message: textareaRef.current?.value ?? text,
      status: 'done',
    });
    onSent();
  }

  return (
    <div className="td-panel">
      <p>
        <span>Tone: </span>
        <span>{TONE_LABEL[tone]}</span>
      </p>
      <textarea
        aria-label="Reminder message"
        className="td-textarea"
        ref={textareaRef}
        value={loading ? 'Drafting…' : text}
        onChange={(e) => setText(e.target.value)}
        disabled={loading}
      />
      {draftError && <p className="td-muted">Couldn't draft a message. Type one below.</p>}
      {copyNote && <p className="td-muted">{copyNote}</p>}
      <div>
        <button type="button" className="td-btn" onClick={copyText} disabled={loading}>
          {copied ? 'Copied' : 'Copy'}
        </button>{' '}
        <button
          type="button"
          className="td-btn"
          onClick={markSent}
          disabled={loading || text.trim() === ''}
        >
          Mark as sent
        </button>
      </div>
    </div>
  );
}

function InvoiceCard({ action, store }: { action: InvoiceAction; store: Store }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const isOver = action.kind === 'overdue';

  return (
    <div className={isOver ? 'td-card td-card--overdue' : 'td-card'}>
      <span className="td-badge">{BADGE_LABEL[action.kind]}</span>
      <h3 className="td-headline">{action.headline}</h3>
      <p className="td-muted">{action.detail}</p>
      <button
        type="button"
        className="td-btn td-btn--primary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Draft reminder
      </button>
      {sent && <p className="td-muted">Marked as sent</p>}
      {open && (
        <DraftPanel
          action={action}
          store={store}
          onSent={() => {
            setSent(true);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BillCard({ action, onPaid }: { action: BillAction; onPaid: () => void }) {
  return (
    <div className="td-card">
      <span className="td-badge">{BADGE_LABEL.bill}</span>
      <h3 className="td-headline">{action.headline}</h3>
      <p className="td-muted">{action.detail}</p>
      <button type="button" className="td-btn td-btn--primary" onClick={onPaid}>
        Mark as paid
      </button>
    </div>
  );
}

export default function TodayPage() {
  const store = useMemo(() => createStore(), []);
  const today = useMemo(() => todayISO(), []);
  const queue = useMemo(() => buildQueue(store, today), [store, today]);
  const [paidBillIds, setPaidBillIds] = useState<Set<string>>(() => new Set());

  const visible = queue.filter(
    (a) => !(a.kind === 'bill' && paidBillIds.has(a.billId)),
  );

  function markBillPaid(billId: string) {
    setPaidBillIds((prev) => new Set(prev).add(billId));
  }

  return (
    <div className="td-page">
      <h1>Today</h1>
      {visible.length === 0 ? (
        <p className="td-empty">Nothing needs you today.</p>
      ) : (
        visible.map((a) =>
          a.kind === 'bill' ? (
            <BillCard key={a.key} action={a} onPaid={() => markBillPaid(a.billId)} />
          ) : (
            <InvoiceCard key={a.key} action={a} store={store} />
          ),
        )
      )}
    </div>
  );
}
