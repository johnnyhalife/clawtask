/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark base inspired by Linear.app
        base: {
          DEFAULT: '#0A0A0B',
          50: '#131316',
          100: '#18181C',
          200: '#1E1E21',
          300: '#27272B',
          400: '#3A3A3E',
          500: '#52525A',
          600: '#71717A',
          700: '#A1A1AA',
          800: '#D4D4D8',
          900: '#F4F4F5',
        },
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          muted: '#1D4ED8',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        priority: {
          urgent: '#EF4444',
          high: '#F59E0B',
          medium: '#3B82F6',
          low: '#6B7280',
        },
        status: {
          todo: '#6B7280',
          in_progress: '#3B82F6',
          blocked: '#EF4444',
          done: '#22C55E',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Fira Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
