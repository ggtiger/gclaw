import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8b5cf6',
          hover: '#7c3aed',
          subtle: 'rgba(139, 92, 246, 0.1)',
        },
        secondary: {
          DEFAULT: 'rgba(236, 72, 153, 0.8)',
          hex: '#ec4899',
        },
        accent: {
          DEFAULT: 'rgba(59, 130, 246, 0.8)',
          hex: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
}

export default config
