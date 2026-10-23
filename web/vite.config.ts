import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 后端（server，GPT 负责）默认地址，可用 AUFD_API 覆盖
const api = process.env.AUFD_API ?? 'http://127.0.0.1:4317'
const proxy = { target: api, changeOrigin: true }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': proxy, '/uploads': proxy, '/assets': proxy },
  },
})
