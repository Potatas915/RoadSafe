/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0f19',
        darkCard: '#131c2e',
        darkBorder: '#1e293b',
        brandOrange: '#f97316',
      },
    },
  },
  plugins: [],
}
