import type { Config } from "tailwindcss";

// Brand tokens extracted from the StarAdmin reference screenshots.
// Status colors mirror Airtable's *Light2* choice palette so dashboard
// badges visually match what shows inside Airtable.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          // Sidebar / primary actions
          ink: "#1f3bb3",
          inkHover: "#172d8a",
          // Surface
          canvas: "#f8f9fc",
          card: "#ffffff",
          border: "#e9eaed",
          subtleBorder: "#f1f2f5",
          // Typography
          heading: "#1c1d2b",
          body: "#54566c",
          muted: "#8a8d9e",
        },
        status: {
          // mirrors Airtable Light2 + Bright color names
          blue: { bg: "#dbe7ff", fg: "#1d3fad" },
          cyan: { bg: "#d6f0f5", fg: "#0e6480" },
          teal: { bg: "#cdf1e6", fg: "#0d6b54" },
          green: { bg: "#d8f0d4", fg: "#1f6f1a" },
          yellow: { bg: "#fcecc1", fg: "#7c5800" },
          orange: { bg: "#ffd9c5", fg: "#9a3a05" },
          red: { bg: "#ffd5d5", fg: "#a31515" },
          pink: { bg: "#fcd5ea", fg: "#8a195e" },
          purple: { bg: "#e0d6f5", fg: "#522d8d" },
          gray: { bg: "#e6e7ec", fg: "#4a4d61" },
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 23, 47, 0.04)",
        cardHover: "0 4px 10px rgba(20, 23, 47, 0.06)",
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
