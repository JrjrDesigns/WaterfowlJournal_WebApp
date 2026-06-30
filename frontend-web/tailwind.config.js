/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a0f1e',
          900: '#0d1526',
          800: '#111c2e',
          700: '#162338',
          600: '#1e3050',
        },
        orange: {
          500: '#f97316',
          600: '#ea6c0a',
          400: '#fb923c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
