/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#4F46E5", // Indigo 600
          dark: "#4338CA", // Indigo 700
          light: "#818CF8", // Indigo 400
        },
        secondary: {
          DEFAULT: "#64748B", // Slate 500
          light: "#F1F5F9", // Slate 100
        },
        accent: {
          DEFAULT: "#10B981", // Emerald 500
        },
      },
    },
  },
  plugins: [],
};
