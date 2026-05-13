/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './design-system/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand accent — matches the web "red" theme (var(--accent)).
        accent: {
          DEFAULT: '#b91c1c', // red-700
          soft: '#fef2f2',    // red-50
        },
        // Page background — cream/beige gradient like the web app.
        canvas: {
          start: '#f8f3eb',
          end: '#efe4d0',
        },
        // Premium gradient used on detail-page headers (game / team / player).
        hero: {
          start: '#5b21b6', // violet-800
          end: '#1d4ed8',   // blue-700
        },
        // Stone palette mirroring the web's body text & borders.
        ink: {
          900: '#1c1917', // stone-900 — primary text
          700: '#44403c', // stone-700 — secondary
          500: '#78716c', // stone-500 — muted
          300: '#d6d3d1', // stone-300 — borders
          200: '#e7e5e4', // stone-200 — light borders
          100: '#f5f5f4', // stone-100 — chips
          50:  '#fafaf9', // stone-50 — card surface
        },
      },
      borderRadius: {
        card: '20px',
        hero: '28px',
      },
    },
  },
  plugins: [],
};
