import type { Config } from "tailwindcss";

// Bảng màu hệ thống — chỉnh 1 chỗ, áp dụng toàn app.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        ink: "#0f172a",       // chữ chính (slate-900)
        muted: "#64748b",     // chữ phụ (slate-500)
        line: "#e2e8f0",      // viền (slate-200)
        surface: "#f8fafc",   // nền (slate-50)
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto",
          "Hiragino Sans", "Noto Sans JP", "Meiryo", "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.03), 0 10px 28px -12px rgba(15,23,42,0.10)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
