/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        yam: {
          // ===== AFROPULSE NIGHT (V2) =====
          // Base pilotee par variables CSS (mode sombre defaut / clair).
          orange: '#FF8A24',   // Primary — signature YAM (15 % de l'ecran max)
          gold: '#F4C95D',     // Accent editorial (5 %)
          violet: '#7C5CFF',   // Secondary — studio / createur (5 %)
          ink: '#150E06',      // Texte POSE sur orange / or (contraste AA 8:1)
          dark: 'rgb(var(--c-bg-base) / <alpha-value>)',
          surface: 'rgb(var(--c-bg-surface) / <alpha-value>)',
          card: 'rgb(var(--c-bg-card) / <alpha-value>)',
          green: '#22C55E'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Affichage editorial : Syne (identite reconnaissable, meme sans logo)
        display: ['Syne', 'Inter', 'sans-serif'],
        // Chiffres / etiquettes techniques : Space Grotesk (BPM, charts, studio)
        grotesk: ['"Space Grotesk"', 'Inter', 'monospace']
      },
      maxWidth: {
        editorial: '72rem'
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-track': 'pulse 1.5s ease-in-out infinite',
        'bounce-eq': 'bounce 0.8s ease-in-out infinite',
        'fade-up': 'fade-up .7s cubic-bezier(.16,1,.3,1) both',
        'vinyl': 'vinyl 22s linear infinite'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        vinyl: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      }
    }
  },
  plugins: []
};
