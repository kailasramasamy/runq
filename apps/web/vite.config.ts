import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ command }) => ({
  // Production base — the SPA owns multiple top-level URL spaces (/finance,
  // /hr, /settings, /admin, ...), so we can't tie its assets to any single
  // one of them. Emit under a neutral `/app-assets/` prefix that Caddy
  // serves directly from the SPA dist, leaving the marketing site's
  // `/assets/...` untouched. Dev server keeps serving from / for HMR.
  base: command === 'build' ? '/app-assets/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'login-redirect',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/login' || req.url === '/login/') {
            req.url = '/index.html';
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4003,
    fs: {
      // Allow reading user-guide markdown files from the monorepo root (../../docs)
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        ws: true,                  // pass-through WebSocket upgrades for /api/v1/support/ws
      },
    },
  },
}));
