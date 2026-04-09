import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--theme-primary) / <alpha-value>)',
          hover: 'rgb(var(--theme-primary) / 0.85)',
          subtle: 'rgb(var(--theme-primary) / 0.1)',
        },
        secondary: {
          DEFAULT: 'rgba(236, 72, 153, 0.8)',
          hex: '#ec4899',
        },
        accent: {
          DEFAULT: 'rgba(59, 130, 246, 0.8)',
          hex: '#3b82f6',
        },
        // 让所有 purple-* Tailwind 类跟随主题颜色
        purple: {
          50: 'rgb(var(--theme-primary) / 0.06)',
          100: 'rgb(var(--theme-primary) / 0.12)',
          200: 'rgb(var(--theme-primary) / 0.22)',
          300: 'rgb(var(--theme-primary) / 0.4)',
          400: 'rgb(var(--theme-primary) / 0.65)',
          500: 'rgb(var(--theme-primary) / 0.85)',
          600: 'rgb(var(--theme-primary) / 1)',
          700: 'rgb(var(--theme-primary) / 0.8)',
        },
      },
    },
  },
  plugins: [],
}

export default config
