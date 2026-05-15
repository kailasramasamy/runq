import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { queryClient } from './lib/query-client';
import { routeTree } from './routes/__root';
import { ThemeProvider } from './providers/theme-provider';
import { AuthProvider } from './providers/auth-provider';
import { ToastProvider } from './components/ui/toast';
import { LoginPage } from './routes/login';
import { AcceptInvitePage } from './routes/accept-invite';
import { initInstallPromptCapture } from './lib/pwa-install';
import './app.css';

const router = createRouter({ routeTree });

// Capture beforeinstallprompt as early as possible — the browser only fires
// this event once, very soon after page load, so we have to be ready before
// the inbox page mounts.
initInstallPromptCapture();

// Register the share-target service worker. The SW only intercepts POSTs
// to /share-receive — it does NOT cache app assets, so it won't
// interfere with Vite HMR in dev. Safe to register in both dev and prod.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[runq] SW registration failed:', err);
      });
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Something went wrong</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = import.meta.env.BASE_URL; }}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Standalone login page — served at /login, rendered outside the router.
const isLoginPath = window.location.pathname === '/login' || window.location.pathname === '/login/';
// Public accept-invite page, rendered outside the router. Also matches the
// legacy /finance/signup/invite/ form so older emailed links still resolve.
const isAcceptInvitePath =
  window.location.pathname.startsWith('/signup/invite/') ||
  window.location.pathname.startsWith('/finance/signup/invite/');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          {isAcceptInvitePath ? (
            <AcceptInvitePage />
          ) : (
            <AuthProvider>
              {isLoginPath ? (
                <LoginPage />
              ) : (
                <QueryClientProvider client={queryClient}>
                  <RouterProvider router={router} />
                </QueryClientProvider>
              )}
            </AuthProvider>
          )}
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
