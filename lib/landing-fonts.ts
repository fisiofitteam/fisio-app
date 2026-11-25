import localFont from "next/font/local";

// Bundled OFL fonts from Fontsource: avoid remote font fetching during builds.
export const display = localFont({
  src: [
    { path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});
export const body = localFont({
  src: [
    { path: "../node_modules/@fontsource/archivo/files/archivo-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/archivo/files/archivo-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/archivo/files/archivo-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});
