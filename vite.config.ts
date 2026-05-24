import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // /api/tase/* → https://api.tase.co.il/api/*
      // The Referer header is required; without it the TASE server returns 403.
      '/api/tase': {
        target: 'https://api.tase.co.il/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tase/, ''),
        headers: {
          Referer: 'https://www.tase.co.il/',
          'Cache-Control': 'no-cache',
        },
      },
    },
  },
})
