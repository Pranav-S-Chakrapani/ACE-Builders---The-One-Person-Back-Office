import { useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { createStore } from '../store';
import { formatDate, formatMoney } from '../domain/format';
import { displayStatus, todayISO } from '../domain/invoiceStatus';

interface Props {
  id: string;
}

export default function InvoiceDetailPage({ id }: Props) {
  const [store] = useState(createStore);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const invoice = store.invoices.getById(id);
  if (!invoice) {
    return (
      <section className="detail">
        <a className="back-link" href="#/invoices">← Back to invoices</a>
        <p className="muted">Invoice not found.</p>
      </section>
    );
  }

  const today = todayISO();
  const client = store.clients.getById(invoice.clientId);
  const payments = store.payments
    .list()
    .filter((p) => p.invoiceId === invoice.id)
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
  const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, invoice.amount - paidSoFar);
  const status = displayStatus(invoice, today, paidSoFar);
  const canMarkPaid = invoice.status === 'sent' || invoice.status === 'partially_paid';
  const canMarkSent = invoice.status === 'draft';

  const markPaid = () => {
    if (!canMarkPaid) return;
    if (remaining > 0) {
      store.payments.create({
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amount: remaining,
        currency: 'INR',
        receivedDate: todayISO(),
      });
    }
    store.invoices.update(invoice.id, { status: 'paid' });
    refresh();
  };

  const markSent = () => {
    if (!canMarkSent) return;
    store.invoices.update(invoice.id, { status: 'sent' });
    refresh();
  };

  return (
    <section className="detail">
      <a className="back-link" href="#/invoices">← Back to invoices</a>

      <div className="page-head">
        <h1>{invoice.number}</h1>
        <StatusBadge status={status} />
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Client</dt>
          <dd>{client?.name ?? 'Unknown client'}</dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{formatDate(invoice.issueDate)}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{formatDate(invoice.dueDate)}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="num">{formatMoney(invoice.amount)}</dd>
        </div>
        <div>
          <dt>Balance remaining</dt>
          <dd className="num">{formatMoney(remaining)}</dd>
        </div>
      </dl>

      <section className="panel">
        <h2 className="panel__title">Line items</h2>
        {invoice.lineItems && invoice.lineItems.length > 0 ? (
          <ul className="plain-list">
            {invoice.lineItems.map((li, i) => (
              <li key={i}>
                <span>{li.description}</span>
                <span className="num">{formatMoney(li.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No line items.</p>
        )}
      </section>

      {invoice.notes && (
        <section className="panel">
          <h2 className="panel__title">Notes</h2>
          <p className="detail-notes">{invoice.notes}</p>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">Payments received</h2>
        {payments.length === 0 ? (
          <p className="muted">No payments yet.</p>
        ) : (
          <ul className="plain-list">
            {payments.map((p) => (
              <li key={p.id}>
                <span>{formatDate(p.receivedDate)}</span>
                <span className="num">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(canMarkSent || canMarkPaid) && (
        <div className="actions">
          {canMarkSent && (
            <button type="button" className="btn btn--primary" onClick={markSent}>
              Mark as sent
            </button>
          )}
          {canMarkPaid && (
            <button type="button" className="btn btn--primary" onClick={markPaid}>
              Mark as paid
            </button>
          )}
        </div>
      )}
    </section>
  );
}
