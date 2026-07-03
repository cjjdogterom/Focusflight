/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Apple system stack: SF Pro on Apple devices (matches the reference app)
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
        serif: ['ui-serif', 'New York', 'Georgia', 'serif'],
      },
      colors: {
        night: {
          900: '#070b12',
          800: '#0b1220',
          700: '#111a2e',
          600: '#18243f',
          500: '#22314f',
        },
        panel: {
          DEFAULT: '#0b1322',
          edge: '#26344e',
          deep: '#05080f',
        },
        sky: {
          accent: '#00a1e4', // KLM blue
        },
        av: {
          amber: '#ffb400', // avionics amber
          green: '#35d07a', // avionics green
          magenta: '#e0148c', // FMS magenta
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
