/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0a09', 900: '#12100e', 800: '#1a1714', 700: '#252019', 600: '#342d24' },
        ivory: { DEFAULT: '#f3ecdc', dim: '#c9c0ad', mute: '#8f8878' },
        gold: { DEFAULT: '#c4a35a', soft: '#d9bf82', deep: '#8f7436' },
        bronze: { DEFAULT: '#8c6a43', deep: '#5b4328' },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '.6' }, '100%': { transform: 'scale(1.9)', opacity: '0' } },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { pulseRing: 'pulseRing 1.6s ease-out infinite', fadeUp: 'fadeUp .7s ease-out both' },
    },
  },
  plugins: [],
}
