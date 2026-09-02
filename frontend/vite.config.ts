import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Port 5173 is taken by the sibling Host Stand app during local dev, so the
    // Cookbook frontend pins its own port. strictPort makes a clash fail loudly
    // instead of silently drifting to 5174.
    port: 5180,
    strictPort: true,
    // Bind on all interfaces so a phone on the same Wi-Fi can load the app for
    // real-device testing (http://<this-machine-LAN-IP>:5180).
    host: true,
    // Relative `/api` + `/media` calls are proxied to the Django backend so the
    // frontend works from any host (phone, another laptop) without CORS or a
    // hard-coded backend IP. Set VITE_API_BASE_URL=/api to use this path.
    // changeOrigin stays false so Django sees the real Host and builds
    // media/image_url absolute URLs the phone can actually reach.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8001' },
      '/media': { target: 'http://127.0.0.1:8001' },
    },
  },
})
