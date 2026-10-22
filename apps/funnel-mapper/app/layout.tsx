import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (latin subset, SIL Open Font License; files and licences in app/fonts): the build never fetches fonts from a font service.
const bricolage = localFont({
  variable: "--font-bricolage",
  src: [
    { path: "./fonts/bricolage-grotesque-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/bricolage-grotesque-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/bricolage-grotesque-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});
const dmSans = localFont({
  variable: "--font-dm-sans",
  src: [
    { path: "./fonts/dm-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/dm-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
const mono = localFont({
  variable: "--font-jetbrains",
  src: [
    { path: "./fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: { default: "Funnel Mapper Pro V2", template: "%s · Funnel Mapper Pro V2" },
  applicationName: "Funnel Mapper Pro V2",
  description: "Map, model, simulate, forecast and present marketing funnels.",
  // private internal tool: keep every page out of search engines
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Light is the only look offered in the ecosystem copy (design 08): no saved preference is read, so nothing can flip it back to dark.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={`${bricolage.variable} ${dmSans.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
