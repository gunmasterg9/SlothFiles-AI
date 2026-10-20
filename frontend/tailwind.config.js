/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sloth: {
          50: '#f6f7f9',
          100: '#eceff2',
          200: '#d5dde4',
          300: '#b0c0ce',
          400: '#849eb4',
          500: '#64829d',
          600: '#4e6983',
          700: '#40556b',
          800: '#38485a',
          900: '#323e4c',
          950: '#1e2630',
        },
        forest: {
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        amber: {
          500: '#f59e0b',
          600: '#d97706',
        }
      }
    },
  },
  plugins: [],
}
