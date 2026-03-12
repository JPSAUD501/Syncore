import type { ReactNode } from "react";
import { JetBrains_Mono, Literata, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const literata = Literata({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif"
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata = {
  title: "Planner Workspace - Syncore",
  description: "A local-first planner workspace powered by Syncore.",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/planner-icon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#2a1f16" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${literata.variable} ${sourceSans.variable} ${jetBrainsMono.variable}`}
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "var(--font-sans)",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale" as never
        }}
      >
        {children}
      </body>
    </html>
  );
}
