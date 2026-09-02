/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        yam: {
          // Couleurs de fond pilotees par variables CSS (mode sombre/clair) :
          // triplets RGB "R G B" + <alpha-value> -> bg-yam-dark/90 etc. marchent.
          orange: '#FF6B35',
          gold: '#FFD166',
          dark: 'rgb(var(--c-bg-base) / <alpha-value>)',
          surface: 'rgb(var(--c-bg-surface) / <alpha-value>)',
          card: 'rgb(var(--c-bg-card) / <alpha-value>)',
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
