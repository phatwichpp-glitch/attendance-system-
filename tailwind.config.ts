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
        primary: "#185FA5",
        "primary-dark": "#0d4a82",
        success: { DEFAULT: "#3B6D11", bg: "#EAF3DE" },
        warning: { DEFAULT: "#854F0B", bg: "#FAEEDA" },
        danger: { DEFAULT: "#A32D2D", bg: "#FCEBEB" },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
