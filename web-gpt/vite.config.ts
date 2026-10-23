import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.BACKEND_URL || 'http://127.0.0.1:4317';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: Object.fromEntries(['/api', '/assets', '/uploads'].map(prefix => [
      prefix, { target: backend, changeOrigin: true }
    ]))
  },
  preview: {
    proxy: Object.fromEntries(['/api', '/assets', '/uploads'].map(prefix => [
      prefix, { target: backend, changeOrigin: true }
    ]))
  }
});
