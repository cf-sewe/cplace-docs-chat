import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        primary: {
          blue: '#00207A',
          sky: '#0058D4',
          mint: '#0CE796',
          'mint-light': '#7FFAC9',
          white: '#FFFFFF',
        },
        secondary: {
          magenta: '#FF3393',
          lilac: '#A84AF0',
          orange: '#FA6D64',
          sunny: '#FF9900',
          'magenta-light': '#FF5EA1',
          'lilac-light': '#BB68FE',
          'orange-light': '#FF7F6B',
          'sunny-light': '#FFAF38',
        },
      },
    },
  },
  plugins: [],
};
export default config;
