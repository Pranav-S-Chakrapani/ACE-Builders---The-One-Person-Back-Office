import { useState, type FormEvent } from 'react';
import type { Stores } from '../store';
import { addDays, isISODate, todayISO } from '../domain/invoiceStatus';
import type { Client, InvoiceStatus } from '../domain/types';

type CreatableStatus = Extract<InvoiceStatus, 'draft' | 'sent'>;

interface Props {
  store: Stores;
  onClose: () => void;
  onSaved: () => void;
}

interface Errors {
  client?: string;
  number?: string;
  issueDate?: string;
  dueDate?: string;
  amount?: string;
  description?: string;
}

/** Positive rupee amount with at most 2 decimals, e.g. "1500", "1500.5", "1500.50". */
const AMOUNT_RE = /^(\d+|\d*\.\d{1,2})$/;

function termsFor(client: Client | undefined): number {
  return client?.paymentTermsDays ?? 0;
}

function formatNumber(n: number): string {
  return `CD-${String(n).padStart(4, '0')}`;
}

function nextNumber(existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(formatNumber(n))) n++;
  return formatNumber(n);
}

export default function InvoiceForm({ store, onClose, onSaved }: Props) {
  const activeClients = store.clients.list().filter((c) => c.status === 'active');
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? '');
  const [number, setNumber] = useState(() =>
    nextNumber(store.invoices.list().map((inv) => inv.number)),
  );
  const [issueDate, setIssueDate] = useState(todayISO);
  const [dueDate, setDueDate] = useState(() =>
    addDays(todayISO(), termsFor(activeClients[0])),
  );
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CreatableStatus>('draft');
  const [errors, setErrors] = useState<Errors>({});

  const selectedClient = activeClients.find((c) => c.id === clientId);

  function handleClientChange(id: string) {
    setClientId(id);
    const client = activeClients.find((c) => c.id === id);
    if (isISODate(issueDate)) setDueDate(addDays(issueDate, termsFor(client)));
  }

  function handleIssueDateChange(value: string) {
    setIssueDate(value);
    if (isISODate(value)) setDueDate(addDays(value, termsFor(selectedClient)));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Errors = {};

    const trimmedNumber = number.trim();
    if (!clientId) next.client = 'Choose an active client.';
    if (!trimmedNumber) {
      next.number = 'Enter an invoice number.';
    } else if (
      store.invoices.list().some((inv) => inv.number.toLowerCase() === trimmedNumber.toLowerCase())
    ) {
      next.number = 'That invoice number is already used.';
    }

    if (!isISODate(issueDate)) next.issueDate = 'Enter a valid issue date.';
    if (!isISODate(dueDate)) {
      next.dueDate = 'Enter a valid due date.';
    } else if (isISODate(issueDate) && dueDate < issueDate) {
      next.dueDate = 'Due date cannot be before the issue date.';
    }

    const cleaned = amountText.trim().replace(/,/g, '');
    const amountOk = AMOUNT_RE.test(cleaned) && Number(cleaned) > 0;
    if (!amountOk) next.amount = 'Enter a positive amount with at most 2 decimals.';

    const trimmedDescription = description.trim();
    if (!trimmedDescription) next.description = 'Describe the line item.';

    setErrors(next);
    if (Object.keys(next).length > 0 || !amountOk) return;

    const amountMinor = Math.round(Number(cleaned) * 100);
    store.invoices.create({
      clientId,
      number: trimmedNumber,
      issueDate,
      dueDate,
      amount: amountMinor,
      currency: 'INR',
      status,
      lineItems: [{ description: trimmedDescription, amount: amountMinor }],
    });
    onSaved();
  }

  return (
    <section className="panel" aria-labelledby="new-invoice-title">
      <h2 id="new-invoice-title" className="panel__title">New invoice</h2>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="inv-client">Client</label>
          <select
            id="inv-client"
            value={clientId}
            onChange={(e) => handleClientChange(e.target.value)}
            aria-invalid={errors.client ? true : undefined}
            aria-describedby={errors.client ? 'inv-client-err' : undefined}
          >
            {activeClients.length === 0 && <option value="">No active clients</option>}
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.client && (
            <p id="inv-client-err" className="field-error">{errors.client}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="inv-number">Invoice number</label>
          <input
            id="inv-number"
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            aria-invalid={errors.number ? true : undefined}
            aria-describedby={errors.number ? 'inv-number-err' : undefined}
          />
          {errors.number && (
            <p id="inv-number-err" className="field-error">{errors.number}</p>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="inv-issue">Issue date</label>
            <input
              id="inv-issue"
              type="date"
              value={issueDate}
              onChange={(e) => handleIssueDateChange(e.target.value)}
              aria-invalid={errors.issueDate ? true : undefined}
              aria-describedby={errors.issueDate ? 'inv-issue-err' : undefined}
            />
            {errors.issueDate && (
              <p id="inv-issue-err" className="field-error">{errors.issueDate}</p>
            )}
          </div>

          <div className="field">
            <label htmlFor="inv-due">Due date</label>
            <input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-invalid={errors.dueDate ? true : undefined}
              aria-describedby={errors.dueDate ? 'inv-due-err' : undefined}
            />
            {errors.dueDate && (
              <p id="inv-due-err" className="field-error">{errors.dueDate}</p>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="inv-amount">Amount (₹)</label>
          <input
            id="inv-amount"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 25000"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? 'inv-amount-err' : undefined}
          />
          {errors.amount && (
            <p id="inv-amount-err" className="field-error">{errors.amount}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="inv-description">Line item description</label>
          <input
            id="inv-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'inv-description-err' : undefined}
          />
          {errors.description && (
            <p id="inv-description-err" className="field-error">{errors.description}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="inv-status">Status</label>
          <select
            id="inv-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as CreatableStatus)}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary">Save invoice</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
