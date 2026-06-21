import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';

import { Router, useRouter } from '@/lib/router';
import MarketingLayout from '@/components/layout/marketing-layout';

import { HomePage } from '@/routes/index';
import Pricing from '@/routes/pricing';
import About from '@/routes/about';
import Contact from '@/routes/contact';
import GetStarted from '@/routes/get-started';
import Privacy from '@/routes/privacy';
import Terms from '@/routes/terms';
import DhenuDeleteAccount from '@/routes/dhenu-delete-account';
import DhenuPrivacy from '@/routes/dhenu-privacy';
import Security from '@/routes/security';
import GstCompliance from '@/routes/gst-compliance';
import NotFound from '@/routes/not-found';

import Invoicing from '@/routes/invoicing';
import BankReconciliation from '@/routes/bank-reconciliation';
import GstFiling from '@/routes/gst-filing';
import BillsExpenses from '@/routes/bills-expenses';
import Reports from '@/routes/reports';
import MobileApps from '@/routes/mobile-apps';

import ForCAs from '@/routes/for-cas';
import ForSmeOwners from '@/routes/for-sme-owners';
import ForManufacturers from '@/routes/for-manufacturers';
import ForService from '@/routes/for-service';

import Careers from '@/routes/careers';
import Press from '@/routes/press';

function ScrollToTopOnRoute() {
  const { path } = useRouter();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [path]);
  return null;
}

function AppRoutes() {
  const { path } = useRouter();

  if (path === '/') return <HomePage />;

  // Product
  if (path.startsWith('/invoicing')) return <Invoicing />;
  if (path.startsWith('/bank-reconciliation')) return <BankReconciliation />;
  if (path.startsWith('/gst-filing')) return <GstFiling />;
  if (path.startsWith('/bills-expenses')) return <BillsExpenses />;
  if (path.startsWith('/reports')) return <Reports />;
  if (path.startsWith('/mobile-apps')) return <MobileApps />;

  // For X
  if (path.startsWith('/for-cas')) return <ForCAs />;
  if (path.startsWith('/for-sme-owners')) return <ForSmeOwners />;
  if (path.startsWith('/for-manufacturers')) return <ForManufacturers />;
  if (path.startsWith('/for-service')) return <ForService />;

  // Company
  if (path.startsWith('/about')) return <About />;
  if (path.startsWith('/careers')) return <Careers />;
  if (path.startsWith('/press')) return <Press />;
  if (path.startsWith('/contact')) return <Contact />;

  if (path.startsWith('/pricing')) return <Pricing />;
  if (path.startsWith('/get-started')) return <GetStarted />;

  // Legal
  if (path.startsWith('/privacy')) return <Privacy />;
  if (path.startsWith('/terms')) return <Terms />;
  if (path.startsWith('/dhenu/delete-account')) return <DhenuDeleteAccount />;
  if (path.startsWith('/dhenu/privacy')) return <DhenuPrivacy />;
  if (path.startsWith('/security')) return <Security />;
  if (path.startsWith('/gst-compliance')) return <GstCompliance />;

  // Legacy redirects (finance is now homepage)
  if (path.startsWith('/finance') || path.startsWith('/hr') || path.startsWith('/bi')) {
    return <HomePage />;
  }

  return <NotFound />;
}

function App() {
  return (
    <Router>
      <ScrollToTopOnRoute />
      <MarketingLayout>
        <AppRoutes />
      </MarketingLayout>
    </Router>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
