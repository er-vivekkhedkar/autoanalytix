/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.05), 0 4px 16px -4px rgba(37,99,235,.08)",
        soft: "0 1px 3px rgba(15,23,42,.06)",
      },
      colors: {
        ink: "#0f172a",
        muted: "#64748b",
        line: "#e6ebf3",
      },
    },
  },
  plugins: [],
};
