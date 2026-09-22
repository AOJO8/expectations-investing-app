/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-secondary': 'var(--panel-secondary)',
        border: 'var(--border)',
        orange: 'var(--orange)',
        'orange-bright': 'var(--orange-bright)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        positive: 'var(--positive)',
        negative: 'var(--negative)',
        neutral: 'var(--neutral)',
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Inter', 'IBM Plex Sans', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', '13px'],
        xs: ['11px', '14px'],
        sm: ['12px', '16px'],
        base: ['13px', '18px'],
      },
      borderRadius: { DEFAULT: '2px', sm: '1px', md: '3px' },
      spacing: { 'row-compact': '22px', 'row-standard': '28px' },
    },
  },
  plugins: [],
}
