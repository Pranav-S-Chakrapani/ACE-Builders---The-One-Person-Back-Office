import { useState } from 'react';
import InvoiceForm from '../components/InvoiceForm';
import StatusBadge from '../components/StatusBadge';
import { createStore } from '../store';
import { formatDate, formatMoney } from '../domain/format';
import { displayStatus, isOpen, isOverdue, todayISO } from '../domain/invoiceStatus';
import type { Invoice } from '../domain/types';

type Filter = 'all' | 'open' | 'overdue' | 'paid' | 'draft';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
  { id: 'draft', label: 'Draft' },
];

function matchesFilter(filter: Filter, invoice: Invoice, today: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return isOpen(invoice, today);
    case 'overdue':
      return isOverdue(invoice, today);
    case 'paid':
      return invoice.status === 'paid';
    case 'draft':
      return invoice.status === 'draft';
  }
}

export default function InvoicesPage() {
  const [store] = useState(createStore);
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [, setVersion] = useState(0);

  // Repositories are read on every render; writes bump `version` to re-render.
  const today = todayISO();
  const clientNames = new Map<string, string>(
    store.clients.list().map((c): [string, string] => [c.id, c.name]),
  );
  const clientName = (id: string): string => clientNames.get(id) ?? 'Unknown client';

  const payments = store.payments.list();
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  }

  const visible = store.invoices
    .list()
    .filter((inv) => matchesFilter(filter, inv, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));

  const newInvoiceButton = (
    <button
      type="button"
      className="btn btn--primary"
      onClick={() => setFormOpen(true)}
      aria-expanded={formOpen}
    >
      New invoice
    </button>
  );

  return (
    <section className="invoices">
      <div className="page-head">
        <h1>Invoices</h1>
        {newInvoiceButton}
      </div>

      {formOpen && (
        <InvoiceForm
          store={store}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setVersion((v) => v + 1);
          }}
        />
      )}

      <div className="chips" role="group" aria-label="Filter invoices">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={f.id === filter ? 'chip chip--active' : 'chip'}
            aria-pressed={f.id === filter}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <p className="muted">
            {filter === 'overdue' ? 'No overdue invoices — nice work.' : 'No invoices in this view.'}
          </p>
          {newInvoiceButton}
        </div>
      ) : (
        <>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Client</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <a href={`#/invoices/${inv.id}`}>{inv.number}</a>
                    </td>
                    <td>{clientName(inv.clientId)}</td>
                    <td className="num">{formatMoney(inv.amount)}</td>
                    <td>{formatDate(inv.dueDate)}</td>
                    <td>
                      <StatusBadge status={displayStatus(inv, today, paidByInvoice.get(inv.id))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="inv-cards">
            {visible.map((inv) => (
              <li key={inv.id}>
                <a className="inv-card" href={`#/invoices/${inv.id}`}>
                  <span className="inv-card__top">
                    <span className="inv-card__number">{inv.number}</span>
                    <StatusBadge status={displayStatus(inv, today, paidByInvoice.get(inv.id))} />
                  </span>
                  <span className="inv-card__client">{clientName(inv.clientId)}</span>
                  <span className="inv-card__meta">
                    <span className="num">{formatMoney(inv.amount)}</span>
                    <span className="muted">Due {formatDate(inv.dueDate)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
