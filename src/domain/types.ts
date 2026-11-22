// Domain types for ClearDue. No business logic lives here.

/** Calendar date, format YYYY-MM-DD. */
export type ISODate = string;

/** Timestamp, ISO 8601 (e.g. new Date().toISOString()). */
export type ISODateTime = string;

/**
 * Money amount as an integer in minor units (e.g. cents for USD/EUR,
 * pence for GBP). Never store floats for money.
 */
export type Minor = number;

export interface BaseEntity {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------- Currency ----------

/** v1 locks every entity to INR. No conversion logic exists. */
export type Currency = 'INR';
export const DEFAULT_CURRENCY: Currency = 'INR';

// ---------- Clients ----------

export type ClientKind = 'retainer' | 'project';
export type ClientStatus = 'active' | 'paused' | 'archived';

export interface Client extends BaseEntity {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  kind: ClientKind;
  /** Only meaningful for retainer clients. Minor units. */
  monthlyRetainerAmount?: Minor;
  currency: Currency;
  paymentTermsDays: number;
  notes?: string;
  status: ClientStatus;
}

// ---------- Invoices ----------

/**
 * Stored status. "overdue" is NOT stored; it is derived at read time
 * (status is 'sent' or 'partially_paid' AND dueDate < today).
 */
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';

export interface InvoiceLineItem {
  description: string;
  /** Minor units. */
  amount: Minor;
}

export interface Invoice extends BaseEntity {
  clientId: string;
  number: string;
  issueDate: ISODate;
  dueDate: ISODate;
  /** Total invoice amount in minor units. */
  amount: Minor;
  currency: Currency;
  status: InvoiceStatus;
  lineItems?: InvoiceLineItem[];
  notes?: string;
}

// ---------- Payments ----------

export interface Payment extends BaseEntity {
  invoiceId: string;
  clientId: string;
  /** Minor units. */
  amount: Minor;
  currency: Currency;
  receivedDate: ISODate;
  method?: string;
  reference?: string;
}

// ---------- Recurring bills (Maya's own expenses) ----------

export type BillFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringBill extends BaseEntity {
  name: string;
  /** Minor units. */
  amount: Minor;
  currency: Currency;
  frequency: BillFrequency;
  nextDueDate: ISODate;
  category?: string;
  active: boolean;
  notes?: string;
}

// ---------- Reminders ----------

export type ReminderTargetType = 'invoice' | 'client' | 'recurring_bill';
export type ReminderChannel = 'whatsapp' | 'email' | 'other';
export type ReminderStatus = 'pending' | 'done' | 'dismissed';

export interface Reminder extends BaseEntity {
  targetType: ReminderTargetType;
  targetId: string;
  dueAt: ISODateTime;
  channel: ReminderChannel;
  message?: string;
  status: ReminderStatus;
}

// ---------- Settings (singleton) ----------

export interface Settings {
  /** Minor units. May be negative. */
  startingBalance: Minor;
  defaultCurrency: Currency;
  businessName?: string;
}

// ---------- Persisted root document ----------

export const SCHEMA_VERSION = 1 as const;

export interface ClearDueData {
  schemaVersion: typeof SCHEMA_VERSION;
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  recurringBills: RecurringBill[];
  reminders: Reminder[];
  /** Single object, not an array. */
  settings: Settings;
}

