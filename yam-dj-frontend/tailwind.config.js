/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        yam: {
          orange: '#FF6B35',
          gold: '#FFD166',
          dark: '#0A0A0A',
          surface: '#141414',
          card: '#1E1E1E',
          green: '#22C55E'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif']
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-track': 'pulse 1.5s ease-in-out infinite',
        'bounce-eq': 'bounce 0.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
