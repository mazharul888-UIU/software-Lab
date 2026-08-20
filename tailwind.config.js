/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F4F1EA",
        paper: "#FBF9F4",
        ink: "#1E2430",
        muted: "#69717D",
        line: "#DDD8CC",
        cobalt: "#3155C6",
        coral: "#C86D50",
        jade: "#4E7864",
        plum: "#77536C",
        sand: "#DED2BE",
      },
      boxShadow: {
        glass: "0 20px 60px rgba(43, 48, 58, 0.10)",
        lift: "0 24px 80px rgba(43, 48, 58, 0.16)",
        button: "0 10px 24px rgba(49, 85, 198, 0.24)",
      },
      fontFamily: {
        sans: ["Inter", "Aptos", "Segoe UI", "sans-serif"],
        display: ["Georgia", "Times New Roman", "serif"],
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        enter: "enter .45s ease-out both",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        enter: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
