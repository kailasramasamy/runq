import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ command }) => ({
  // Production base — Caddy mounts the SPA at /finance/* (with prefix strip),
  // so emitting assets under /finance/assets/... keeps them isolated from the
  // marketing site's /assets/... (apps/www). Dev server keeps serving from /.
  base: command === 'build' ? '/finance/' : '/',
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
