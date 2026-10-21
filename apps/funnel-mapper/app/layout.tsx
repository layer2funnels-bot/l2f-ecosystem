import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "700"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

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
