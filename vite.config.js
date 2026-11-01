import { defineConfig } from 'vite';
import { devHarbor, DEV_SERVER_PORT } from './server/devPlugin.js';

const harbor = `http://127.0.0.1:${DEV_SERVER_PORT}`;

export default defineConfig({
  plugins: [devHarbor()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Online im Dev: WebSocket und Weck-Ping gehen an den lokalen Spielserver.
    proxy: {
      '/ws': { target: harbor, ws: true },
      '/health': { target: harbor },
    },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
