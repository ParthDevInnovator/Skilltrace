module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        canvas: '#f8f7f4',
        surface: '#ffffff',
        'surface-low': '#f5f3ed',
        'surface-container': '#eeece6',
        'surface-high': '#e8e5dd',
        'border-default': '#e7e2d9',
        'border-subtle': '#eae7df',
        champagne: {
          DEFAULT: '#d4af37',
          dark: '#a9874e',
          light: '#faf5e8',
          border: '#ebd8a8',
          subtle: '#f8f1e3',
          hover: '#f5ebd7',
        },
        charcoal: {
          DEFAULT: '#141618',
          dark: '#0e1012',
          light: '#202020',
          subtle: '#2a2d32',
        },
        editorial: {
          text: '#171717',
          muted: '#77736d',
          subtle: '#9c9890',
        },
      },
      boxShadow: {
        xs: '0 1px 2px rgb(0 0 0 / 0.04)',
        card: '0 1px 3px rgba(32, 36, 44, 0.05), 0 1px 2px rgba(32, 36, 44, 0.03)',
        floating: '0 12px 32px -4px rgba(20, 22, 24, 0.08), 0 4px 12px -2px rgba(20, 22, 24, 0.04)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
