import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

const plexMono = IBM_Plex_Mono({
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
        <meta name="theme-color" content="#241b14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${plexSans.variable} ${plexMono.variable}`}
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
