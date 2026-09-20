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
        canvas: "#F0F2F5",
        paper: "#FFFFFF",
        ink: "#050505",
        muted: "#65676B",
        line: "#DADDE1",
        cobalt: "#1877F2",
        coral: "#E41E3F",
        jade: "#31A24C",
        plum: "#8A4F7D",
        sand: "#E4E6EB",
      },
      boxShadow: {
        glass: "0 1px 2px rgba(0, 0, 0, 0.12)",
        lift: "0 2px 8px rgba(0, 0, 0, 0.14)",
        button: "0 1px 2px rgba(24, 119, 242, 0.28)",
      },
      fontFamily: {
        sans: ["Inter", "Aptos", "Segoe UI", "sans-serif"],
        display: ["Inter", "Aptos", "Segoe UI", "sans-serif"],
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
