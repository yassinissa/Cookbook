import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Enable the service worker in dev mode too, so installability can be
      // tested against the dev server (LAN IP on a phone) without a build.
      devOptions: { enabled: true },
      manifest: {
        name: 'Cookbook — Green Hills',
        short_name: 'Cookbook',
        description: 'Recipe authoring, costing, and QA for Green Hills kitchens.',
        theme_color: '#a8681c',
        background_color: '#f7f5f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
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
