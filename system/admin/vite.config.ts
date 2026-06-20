import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiProxyTarget = 'http://127.0.0.1:3000'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/admin/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/admin/build': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
