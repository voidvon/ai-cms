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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('@uiw/react-codemirror') || id.includes('@codemirror/')) {
            return 'editor'
          }

          if (id.includes('/quill/') || id.includes('quill/dist/')) {
            return 'richtext'
          }

          if (id.includes('@tanstack/react-query')) {
            return 'react-query'
          }

          if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react')) {
            return 'react-core'
          }

          if (
            id.includes('@radix-ui/') ||
            id.includes('lucide-react') ||
            id.includes('class-variance-authority') ||
            id.includes('clsx') ||
            id.includes('tailwind-merge') ||
            id.includes('sonner') ||
            id.includes('next-themes')
          ) {
            return 'ui-kit'
          }

          return 'vendor'
        },
      },
    },
  },
})
