import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1b1f24",
        paper: "#f7f6f2",
        line: "#dfddd4",
        policy: {
          red: "#b23a48",
          gold: "#b7822f",
          green: "#2f7d69",
          blue: "#315f8d"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(27, 31, 36, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
