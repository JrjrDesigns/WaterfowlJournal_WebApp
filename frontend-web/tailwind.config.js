/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:      '#13141A',
        bg:       '#F1F2F4',
        surface:  '#FFFFFF',
        hairline: '#E4E5E3',
        muted:    '#797B7E',
        green:    '#1B5E45',
        blue:     '#1B4F6E',
      },
      fontFamily: {
        sans:    ['"Work Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Bebas Neue"', '"Arial Narrow"', 'sans-serif'],
        brand:   ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
