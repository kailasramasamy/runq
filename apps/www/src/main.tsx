import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';

import { Router, useRouter } from '@/lib/router';
import MarketingLayout from '@/components/layout/marketing-layout';
import { HomePage } from '@/routes/index.tsx';
import Finance from '@/routes/finance';
import HR from '@/routes/hr';
import BI from '@/routes/bi';
import Pricing from '@/routes/pricing';
import About from '@/routes/about';
import Contact from '@/routes/contact';
import GetStarted from '@/routes/get-started';
import NotFound from '@/routes/not-found';

function AppRoutes() {
  const { path } = useRouter();

  if (path === '/') return <HomePage />;
  if (path.startsWith('/finance')) return <Finance />;
  if (path.startsWith('/hr')) return <HR />;
  if (path.startsWith('/bi')) return <BI />;
  if (path.startsWith('/pricing')) return <Pricing />;
  if (path.startsWith('/about')) return <About />;
  if (path.startsWith('/contact')) return <Contact />;
  if (path.startsWith('/get-started')) return <GetStarted />;
  return <NotFound />;
}

function App() {
  return (
    <Router>
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
