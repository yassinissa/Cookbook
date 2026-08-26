/** @type {import('tailwindcss').Config} */

// Semantic colours are CSS custom properties (see src/styles/tokens.css) so
// light/dark is one variable swap, not a per-utility `dark:` fork. Values are
// precomputed hex / rgba — no color-mix(), no `/alpha` modifiers on these
// tokens (iOS 15 Safari on the kitchen iPads). Where transparency is needed
// there is a dedicated token (overlay, *-subtle, hairline…).
const token = (name) => `var(--${name})`

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // surfaces & lines
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-raised': token('surface-raised'),
        'surface-sunken': token('surface-sunken'),
        hairline: token('hairline'),
        'hairline-strong': token('hairline-strong'),
        overlay: token('overlay'),

        // text
        ink: token('ink'),
        'ink-muted': token('ink-muted'),
        'ink-subtle': token('ink-subtle'),
        'ink-inverse': token('ink-inverse'),

        // one accent — warm ochre, the spice-and-kitchen identity
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          pressed: token('accent-pressed'),
          subtle: token('accent-subtle'),
          'subtle-hover': token('accent-subtle-hover'),
          ink: token('accent-ink'),
          50: '#fdf8f0', 100: '#faecd6', 200: '#f3d9ad', 300: '#e9bd74',
          400: '#dc9f45', 500: '#c98527', 600: '#a8681c', 700: '#87511a',
          800: '#6d421c', 900: '#5a381c',
        },

        // status — state only, never decoration; always paired with icon/label
        success: {
          DEFAULT: token('success'), subtle: token('success-subtle'), ink: token('success-ink'),
          50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
        },
        warning: {
          DEFAULT: token('warning'), subtle: token('warning-subtle'), ink: token('warning-ink'),
          50: '#fff7ed', 500: '#f97316', 600: '#ea580c', 700: '#c2410c',
        },
        danger: {
          DEFAULT: token('danger'), subtle: token('danger-subtle'), ink: token('danger-ink'),
          50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderColor: { DEFAULT: token('hairline') },
      ringColor: { DEFAULT: token('focus') },
      boxShadow: {
        popover: 'var(--shadow-popover)',
        modal: 'var(--shadow-modal)',
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
      transitionDuration: { DEFAULT: '160ms' },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'drawer-in-ltr': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'drawer-in-rtl': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'toast-in': 'toast-in 180ms ease-out',
        'fade-rise': 'fade-rise 200ms ease-out both',
        'overlay-in': 'overlay-in 140ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
