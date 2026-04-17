import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d9eeff",
          500: "#0c67b5",
          600: "#09589d",
          700: "#09467b",
          900: "#072842"
        }
      }
    }
  },
  plugins: [],
};

export default config;
