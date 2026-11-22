import {
  DEFAULT_CURRENCY,
  SCHEMA_VERSION,
  type Client,
  type ClientKind,
  type ClearDueData,
  type Invoice,
  type InvoiceStatus,
  type Payment,
  type RecurringBill,
  type Reminder,
  type Settings,
  type BillFrequency,
} from '../domain/types';
import { newId, now } from '../domain/ids';
import { addDays } from '../domain/invoiceStatus';

// Demo data for Maya Rao Design Studio (fictional). All money in paise.
// Dates are offsets in days from `today`; negative = past, positive = future.

interface ClientSpec {
  name: string;
  company: string;
  email: string;
  kind: ClientKind;
  monthly?: number;
  terms: number;
}

const CLIENT_SPECS: ClientSpec[] = [
  { name: 'Kiran Mehta', company: 'Mehta & Co Interiors', email: 'kiran@mehtaandco.in', kind: 'retainer', monthly: 4500000, terms: 7 },
  { name: 'Ananya Iyer', company: 'Iyer Organics', email: 'ananya@iyerorganics.in', kind: 'retainer', monthly: 3500000, terms: 15 },
  { name: 'Rohan Deshpande', company: 'Deshpande Wellness Clinic', email: 'rohan@deshpandewellness.in', kind: 'retainer', monthly: 2500000, terms: 7 },
  { name: 'Priya Nair', company: 'Nair Textiles', email: 'priya@nairtextiles.in', kind: 'project', terms: 15 },
  { name: 'Vikram Sethi', company: 'Sethi Logistics', email: 'vikram@sethilogistics.in', kind: 'project', terms: 30 },
  { name: 'Neha Kapoor', company: 'Kapoor Bakehouse', email: 'neha@kapoorbakehouse.in', kind: 'project', terms: 15 },
  { name: 'Arjun Reddy', company: 'Reddy & Sons Realty', email: 'arjun@reddyandsons.in', kind: 'project', terms: 30 },
];

interface InvoiceSpec {
  /** Index into CLIENT_SPECS. */
  client: number;
  description: string;
  amount: number;
  issue: number;
  due: number;
  status: InvoiceStatus;
  pay?: { amount: number; on: number };
}

const RETAINER_MONTH = 'Monthly design retainer';

// Index order = invoice number order (CD-0001 .. CD-0020).
const INVOICE_SPECS: InvoiceSpec[] = [
  // 8 paid on time (received on or before due date)
  { client: 0, description: `${RETAINER_MONTH} — social posts & brand upkeep`, amount: 4500000, issue: -67, due: -60, status: 'paid', pay: { amount: 4500000, on: -62 } },
  { client: 1, description: `${RETAINER_MONTH} — campaign assets`, amount: 3500000, issue: -60, due: -45, status: 'paid', pay: { amount: 3500000, on: -47 } },
  { client: 2, description: `${RETAINER_MONTH} — clinic brochures & web updates`, amount: 2500000, issue: -60, due: -53, status: 'paid', pay: { amount: 2500000, on: -55 } },
  { client: 3, description: 'Brand identity — logo, palette & type system', amount: 1800000, issue: -45, due: -30, status: 'paid', pay: { amount: 1800000, on: -30 } },
  { client: 4, description: 'Landing page design — 5 sections, mobile-first', amount: 9500000, issue: -50, due: -20, status: 'paid', pay: { amount: 9500000, on: -24 } },
  { client: 5, description: 'Instagram social media kit — 12 post templates', amount: 800000, issue: -50, due: -35, status: 'paid', pay: { amount: 800000, on: -36 } },
  { client: 6, description: 'Brand identity — full guidelines', amount: 12000000, issue: -40, due: -10, status: 'paid', pay: { amount: 12000000, on: -12 } },
  { client: 0, description: `${RETAINER_MONTH} — festive season creatives`, amount: 4500000, issue: -37, due: -30, status: 'paid', pay: { amount: 4500000, on: -31 } },
  // 3 paid late (received 5-12 days after due date)
  { client: 1, description: `${RETAINER_MONTH} — newsletter & banners`, amount: 3500000, issue: -65, due: -50, status: 'paid', pay: { amount: 3500000, on: -43 } },
  { client: 3, description: 'Packaging artwork — 3 SKUs', amount: 2400000, issue: -57, due: -42, status: 'paid', pay: { amount: 2400000, on: -33 } },
  { client: 5, description: 'Menu & signage design', amount: 1500000, issue: -43, due: -28, status: 'paid', pay: { amount: 1500000, on: -23 } },
  // 1 partially paid (half received, due in the past)
  { client: 4, description: 'E-commerce product banners — set of 8', amount: 6000000, issue: -55, due: -25, status: 'partially_paid', pay: { amount: 3000000, on: -26 } },
  // 3 sent and overdue (due today-5, today-15, today-40)
  { client: 2, description: `${RETAINER_MONTH} — clinic brochures & web updates`, amount: 2500000, issue: -12, due: -5, status: 'sent' },
  { client: 6, description: 'Website design — 8 pages, desktop & mobile', amount: 4000000, issue: -45, due: -15, status: 'sent' },
  { client: 3, description: 'Fabric tag & hangtag design', amount: 1200000, issue: -55, due: -40, status: 'sent' },
  // 2 sent, not yet due
  { client: 0, description: `${RETAINER_MONTH} — festive season creatives`, amount: 4500000, issue: -4, due: 3, status: 'sent' },
  { client: 4, description: 'Explainer illustrations — 6 scenes', amount: 7500000, issue: -18, due: 12, status: 'sent' },
  // 2 drafts (issued in last 5 days, due in future)
  { client: 1, description: `${RETAINER_MONTH} — campaign assets`, amount: 3500000, issue: -2, due: 13, status: 'draft' },
  { client: 5, description: 'Logo refresh & favicon set', amount: 950000, issue: -4, due: 11, status: 'draft' },
  // 1 void (old, no payment)
  { client: 6, description: 'Pitch deck design — 14 slides', amount: 1000000, issue: -80, due: -65, status: 'void' },
];

interface BillSpec {
  name: string;
  amount: number;
  frequency: BillFrequency;
  nextDue: number;
  category: string;
}

const BILL_SPECS: BillSpec[] = [
  { name: 'Figma Professional', amount: 130000, frequency: 'monthly', nextDue: 4, category: 'Software' },
  { name: 'Notion Plus', amount: 160000, frequency: 'monthly', nextDue: 15, category: 'Software' },
  { name: 'Co-working desk rent', amount: 1800000, frequency: 'monthly', nextDue: 1, category: 'Rent' },
  { name: 'Google Workspace (1 seat)', amount: 140000, frequency: 'monthly', nextDue: 6, category: 'Software' },
  { name: 'Freelance illustrator — monthly retainer', amount: 1500000, frequency: 'monthly', nextDue: 22, category: 'Contractors' },
  { name: 'Domain & hosting renewal', amount: 900000, frequency: 'yearly', nextDue: 78, category: 'Hosting & domains' },
];

/** Builds the demo data set. `today` is a local YYYY-MM-DD string. */
export function buildSeedData(today: string): ClearDueData {
  const ts = now();

  const clients: Client[] = CLIENT_SPECS.map((c): Client => ({
    id: newId(),
    name: c.name,
    company: c.company,
    email: c.email,
    kind: c.kind,
    ...(c.monthly !== undefined ? { monthlyRetainerAmount: c.monthly } : {}),
    currency: DEFAULT_CURRENCY,
    paymentTermsDays: c.terms,
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
  }));

  const invoices: Invoice[] = [];
  const payments: Payment[] = [];

  INVOICE_SPECS.forEach((s, i) => {
    const client = clients[s.client];
    const invoice: Invoice = {
      id: newId(),
      clientId: client.id,
      number: `CD-${String(i + 1).padStart(4, '0')}`,
      issueDate: addDays(today, s.issue),
      dueDate: addDays(today, s.due),
      amount: s.amount,
      currency: DEFAULT_CURRENCY,
      status: s.status,
      lineItems: [{ description: s.description, amount: s.amount }],
      createdAt: ts,
      updatedAt: ts,
    };
    invoices.push(invoice);

    if (s.pay) {
      payments.push({
        id: newId(),
        invoiceId: invoice.id,
        clientId: client.id,
        amount: s.pay.amount,
        currency: DEFAULT_CURRENCY,
        receivedDate: addDays(today, s.pay.on),
        method: 'UPI',
        createdAt: ts,
        updatedAt: ts,
      });
    }
  });

  const recurringBills: RecurringBill[] = [
    ...BILL_SPECS.map((b) => ({
      id: newId(),
      name: b.name,
      amount: b.amount,
      currency: DEFAULT_CURRENCY,
      frequency: b.frequency,
      nextDueDate: addDays(today, b.nextDue),
      category: b.category,
      active: true,
      createdAt: ts,
      updatedAt: ts,
    })),
    {
      id: newId(),
      name: 'Annual software suite renewal',
      amount: 32500000,
      currency: 'INR',
      frequency: 'yearly',
      nextDueDate: addDays(today, 60),
      category: 'Software',
      active: true,
      notes: 'Annual renewal; sized to create a cash squeeze around day 60.',
      createdAt: ts,
      updatedAt: ts,
    },
  ];


  const overdueInvoice = invoices[12]; // CD-0013, due today-5
  const coworkingBill = recurringBills[2];

  const reminders: Reminder[] = [
    {
      id: newId(),
      targetType: 'invoice',
      targetId: overdueInvoice.id,
      dueAt: `${today}T10:00:00`,
      channel: 'whatsapp',
      message: 'Follow up on CD-0013 (₹25,000), 5 days overdue',
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: newId(),
      targetType: 'recurring_bill',
      targetId: coworkingBill.id,
      dueAt: `${today}T10:00:00`,
      channel: 'whatsapp',
      message: 'Co-working desk rent (₹18,000) due tomorrow',
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const settings: Settings = {
    startingBalance: 14500000,
    defaultCurrency: DEFAULT_CURRENCY,
    businessName: 'Maya Rao Design Studio',
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    clients,
    invoices,
    payments,
    recurringBills,
    reminders,
    settings,
  };
}
