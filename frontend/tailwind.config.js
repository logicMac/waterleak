/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#0EA5E9',
          dark: '#0284C7',
          light: '#38BDF8',
          50: '#F0F9FF',
          100: '#E0F2FE',
          600: '#0284C7',
          700: '#0369A1',
        },
        navy: '#0F172A',
        ground: '#F1F5F9',
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 8px 30px rgb(15 23 42 / 0.16)',
      },
      keyframes: {
        'trip-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(220 38 38 / 0.30)' },
          '50%': { boxShadow: '0 0 0 7px rgb(220 38 38 / 0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'trip-pulse': 'trip-pulse 1.6s ease-in-out infinite',
        'fade-up': 'fade-up .18s ease-out',
      },
    },
  },
  plugins: [],
}
