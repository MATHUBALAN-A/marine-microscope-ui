import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/tb-api': {
        target: 'https://thingsboard.cloud/api/v1/3223pxzy1qp8twchq5dq',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tb-api/, ''),
        secure: true
      }
    }
  }
});