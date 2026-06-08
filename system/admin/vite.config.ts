import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/admin/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/admin/login': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/admin/logout': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/admin/build': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
