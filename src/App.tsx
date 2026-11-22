import { useEffect, useState } from 'react';
import Placeholder from './pages/Placeholder';
import DashboardPage from './pages/DashboardPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import ForecastPage from './pages/ForecastPage';
import { resetToSeed } from './store/localStorageRepository';
import TodayPage from './pages/TodayPage';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'today', label: 'Today' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#\/?/, '').split('/')[0];
  const match = TABS.find((tab) => tab.id === id);
  return match ? match.id : 'dashboard';
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const active = tabFromHash(hash);
  const invoiceMatch = /^#\/invoices\/([^/?#]+)$/.exec(hash);

  return (
    <>
      <header className="topbar">
        <div className="wordmark">ClearDue</div>
        <nav className="tabs" aria-label="Primary">
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <a
                key={tab.id}
                href={`#/${tab.id}`}
                className={isActive ? 'tab tab--active' : 'tab'}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>
      </header>
      <main className="page">
        {active === 'dashboard' && <DashboardPage />}
        {active === 'invoices' &&
          (invoiceMatch ? (
            <InvoiceDetailPage key={invoiceMatch[1]} id={decodeURIComponent(invoiceMatch[1])} />
          ) : (
            <InvoicesPage />
          ))}
        {active === 'forecast' && <ForecastPage />}
        {active === 'today' && <TodayPage />}
      </main>
      <footer className="footer">
        <button
          type="button"
          className="footer__reset"
          onClick={() => {
            if (!window.confirm('Reset all data to the demo set?')) return;
            resetToSeed();
            window.location.reload();
          }}
        >
          Reset demo data
        </button>
      </footer>
    </>
  );
}
