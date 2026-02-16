/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tunnel: {
          900: '#06080f',
          800: '#0a1222',
          700: '#0f1b33',
          600: '#163154',
        },
        neon: {
          cyan: '#32f0ff',
          blue: '#4f8cff',
          violet: '#9a7dff',
          amber: '#f7c75d',
        },
        primary: {
          50: '#ecf5ff',
          500: '#4f8cff',
          600: '#2f6bff',
          700: '#2555d1',
        }
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(79,140,255,0.25), 0 10px 30px rgba(25,55,140,0.45), 0 0 36px rgba(50,240,255,0.2)',
        glass: '0 10px 40px rgba(2, 6, 23, 0.5)',
      },
      animation: {
        'tunnel-pulse': 'tunnel-pulse 6s ease-in-out infinite',
        'border-flow': 'border-flow 8s linear infinite',
      },
      keyframes: {
        'tunnel-pulse': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' },
        },
        'border-flow': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
    },
  },
  plugins: [],
}
