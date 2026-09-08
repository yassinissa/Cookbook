import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a silent auto-reload can interrupt someone
      // mid-edit, and — worse — an installed PWA that's only ever backgrounded
      // never triggers the update check, so users sat on a stale build until a
      // manual cache clear. src/pwa/UpdatePrompt.tsx registers the SW, re-checks
      // on focus + hourly, and shows a dismissible "Reload" pill when a new
      // build is waiting.
      registerType: 'prompt',
      injectRegister: null,
      // Enable the service worker in dev mode too, so installability can be
      // tested against the dev server (LAN IP on a phone) without a build.
      devOptions: { enabled: true },
      workbox: {
        // Offline = read what was already loaded. A hard refresh on any route
        // while offline still resolves to the app shell (precached), which
        // then renders from the API cache below.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Cookbook read endpoints. NetworkFirst so an online client always
            // gets fresh data; an offline one falls back to the last response
            // it saw (a flaky link gives up after 4s and uses the cache).
            // Writes are POST/PATCH/DELETE — Workbox never caches those, so
            // they just fail offline and the form shows pwa.offline.saveBlocked.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cookbook-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Dish / plating photos.
            urlPattern: ({ url }) => url.pathname.startsWith('/media/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cookbook-media',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
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
