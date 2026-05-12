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
        // ── core surfaces ──────────────────────────────────────
        bg:               "#080b0f",
        bg2:              "#111319",  // surface
        bg3:              "#191b21",  // surface-low
        surface:          "#111319",
        "surface-low":    "#191b21",
        "surface-mid":    "#1d1f25",
        "surface-high":   "#282a30",
        "surface-highest":"#33353b",
        // ── borders ───────────────────────────────────────────
        border:           "#1c2430",  // border-subtle
        border2:          "#414752",  // border-strong
        "border-subtle":  "#1c2430",
        "border-strong":  "#414752",
        // ── text ──────────────────────────────────────────────
        ink:              "#e2e2ea",  // text-primary
        muted:            "#8a919e",  // text-dim
        muted2:           "#c0c7d4",  // text-muted
        "text-primary":   "#e2e2ea",
        "text-muted":     "#c0c7d4",
        "text-dim":       "#8a919e",
        // ── accents ───────────────────────────────────────────
        accent:           "#4a9eff",  // accent-blue-container
        "accent-blue":    "#a4c9ff",
        teal:             "#41eec2",  // accent-teal
        amber:            "#ffb955",  // accent-amber
        "accent-teal":    "#41eec2",
        "accent-amber":   "#ffb955",
        vivienne:         "#c8956a",
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "sans-serif"],
        mono:    ["var(--font-jetbrains)", "monospace"],
        display: ["var(--font-garamond)", "serif"],
      },
      borderRadius: {
        DEFAULT: "0px",
        sm:  "0px",
        md:  "0px",
        lg:  "0px",
        xl:  "0px",
        "2xl": "0px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
