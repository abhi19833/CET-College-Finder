/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        mist: "#f4efe6",
        clay: "#d97706",
        pine: "#14532d",
        rose: "#9f1239",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "Times New Roman", "serif"],
        body: ["Trebuchet MS", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        soft: "0 20px 60px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};
