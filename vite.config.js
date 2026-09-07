import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';

// Force Node.js to prefer IPv4 over IPv6 (resolves mobile hotspot ETIMEDOUT)
dns.setDefaultResultOrder('ipv4first');

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/tb-api': {
        target: 'https://thingsboard.cloud/api/v1/2kVLXkUxxWi2PqGmFmJj',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tb-api/, ''),
        secure: true,
        timeout: 10000
      }
    }
  }
});