/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm gold/amber — Cookbook's own identity, distinct from
        // inventory-platform's teal. Muted/sophisticated, not neon.
        accent: {
          50:  '#fdf8f0',
          100: '#faecd6',
          200: '#f3d9ad',
          300: '#e9bd74',
          400: '#dc9f45',
          500: '#c98527',
          600: '#a8681c',
          700: '#87511a',
          800: '#6d421c',
          900: '#5a381c',
        },
        // Semantic colors — distinct hues from accent so "warning" never
        // reads as "primary action."
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fff7ed', 500: '#f97316', 600: '#ea580c', 700: '#c2410c' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
      },
    },
  },
  plugins: [],
}
