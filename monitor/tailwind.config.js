/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./static/**/*.html",
    "./static/js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-light': 'var(--panel-light)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-yellow': 'var(--accent-yellow)',
        'accent-green': 'var(--accent-green)',
        'accent-red': 'var(--accent-red)',
        error: 'var(--error)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        'input-bg': 'var(--input-bg)'
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      animation: {
        skeletonPulse: 'skeletonPulse 1.5s infinite linear',
        slideUpFade: 'slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shake: 'shake 0.4s ease',
      },
      keyframes: {
        skeletonPulse: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        slideUpFade: {
          '0%': { opacity: '0', transform: 'translateY(30px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        }
      }
    },
  },
  plugins: [],
}
