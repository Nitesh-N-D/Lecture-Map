import scales from './src/styles/scales.json' with { type: 'json' }

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware scales (see src/styles/scales.css). Dark theme mirrors each scale.
        ...scales,
        // Fixed sage scale: never flips, for text on always-dark panels.
        sage: {
          50: '#f3f8f1', 100: '#e5f0e5', 200: '#cfe3d2', 300: '#b9d6bf',
          400: '#96c0a3', 500: '#78a98a', 600: '#5e8f72',
        },
        // Semantic action colours.
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          active: 'rgb(var(--primary-active) / <alpha-value>)',
        },
        'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        'on-danger': 'rgb(var(--on-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"Fraunces Variable"', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        paper: '0 1px 0 rgb(var(--shadow-rgb) / 0.04), 0 1px 2px rgb(var(--shadow-rgb) / 0.10)',
        lift: '0 1px 0 rgb(var(--shadow-rgb) / 0.04), 0 10px 28px -10px rgb(var(--shadow-rgb) / 0.28)',
        glow: '0 10px 30px -10px rgb(var(--glow-rgb) / 0.55)',
      },
      animation: {
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        pulseRing: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.5, transform: 'scale(1.05)' },
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        slideIn: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: 0, transform: 'scale(0.95)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
}
