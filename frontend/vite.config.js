import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /api to the PHP backend. For WAMP the API lives at
// http://localhost/waterleak/backend/public/api — override with VITE_API_PROXY.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost/waterleak/backend/public',
        changeOrigin: true,
      },
    },
  },
})
