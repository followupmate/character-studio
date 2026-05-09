import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#080b0f",
        bg2: "#0d1117",
        bg3: "#131920",
        border: "#1c2430",
        border2: "#243040",
        ink: "#d4dce8",
        muted: "#4a5a6a",
        muted2: "#7a8a9a",
        accent: "#4a9eff",
        teal: "#00d4aa",
        amber: "#f5a623",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "sans-serif"],
        mono: ["var(--font-fira)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
