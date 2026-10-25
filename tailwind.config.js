/** @type {import('tailwindcss').Config} */
// Theme colors read CSS variables (see src/index.css) so the same classes work in light and dark.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`
const slate = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, v(`--slate-${n}`)]))

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate,
        darkBg: v('--c-bg'),
        darkCard: v('--c-card'),
        darkBorder: v('--c-border'),
        shell: v('--c-shell'),
        edge: v('--c-edge'),
        strong: v('--c-strong'),
        brandOrange: '#f97316',
      },
    },
  },
  plugins: [],
}
