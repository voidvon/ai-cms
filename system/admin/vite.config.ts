import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { ADMIN_VITE_TARGET } from '../shared/browser-targets.mjs'

const apiProxyTarget = 'http://127.0.0.1:1231'

const isNodePackage = (id: string, packageName: string) => {
  const normalized = id.split(path.sep).join('/')
  return normalized.includes(`/node_modules/${packageName}/`)
    || normalized.includes(`/node_modules/.pnpm/`)
      && normalized.includes(`/node_modules/${packageName}/`)
}

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
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/upload': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/uploadfile': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/images': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/img': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/skin': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/pdfs': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: [...ADMIN_VITE_TARGET],
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

          if (
            isNodePackage(id, 'react') ||
            isNodePackage(id, 'react-dom') ||
            isNodePackage(id, 'react-router') ||
            isNodePackage(id, 'react-router-dom')
          ) {
            return 'react-core'
          }

          return 'vendor'
        },
      },
    },
  },
})
