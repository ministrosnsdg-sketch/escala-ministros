/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4A6FA5',
        borderc: '#3F5F8F',
        headerBg: '#D6E6F7',
        appBg: '#F5F7FA'
      }
    }
  },
  plugins: []
}