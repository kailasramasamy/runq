import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { queryClient } from './lib/query-client';
import { routeTree } from './routes/__root';
import { ThemeProvider } from './providers/theme-provider';
import { AuthProvider } from './providers/auth-provider';
import { ToastProvider } from './components/ui/toast';
import './app.css';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
