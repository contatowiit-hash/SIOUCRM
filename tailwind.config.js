/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#05070D',
        panel: '#0B1020',
        panel2: '#111827',
        neon: '#00AFFF',
        electric: '#2563EB',
        muted: '#94A3B8',
        line: 'rgba(0,175,255,0.18)',
      },
      boxShadow: {
        glow: '0 0 36px rgba(0,175,255,0.18)',
        button: '0 0 22px rgba(0,175,255,0.28)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'radial-grid':
          'radial-gradient(circle at top left, rgba(0,175,255,0.17), transparent 28rem), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
