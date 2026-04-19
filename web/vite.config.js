import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development, proxy /api/* to the Melvai API server (default: localhost:3000).
    // Set VITE_API_SERVER in .env.local to override.
    proxy: {
      '/api': {
        target: process.env.VITE_API_SERVER || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

