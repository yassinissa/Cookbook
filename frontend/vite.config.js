import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port 5173 is taken by the sibling Host Stand app during local dev, so the
  // Cookbook frontend pins its own port. strictPort makes a clash fail loudly
  // instead of silently drifting to 5174.
  server: { port: 5180, strictPort: true },
})
