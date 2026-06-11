import type { Metadata } from "next";
import { Archivo, Inclusive_Sans } from "next/font/google";
import "./globals.css";

// Inclusive Sans = the brand body face. Archivo = a clean neo-grotesque
// standing in for the licensed Elza headline face. Self-hosted via next/font.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-headline-loaded",
  display: "swap",
});

const inclusiveSans = Inclusive_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body-loaded",
  display: "swap",
});

const TITLE = "Red Bee Portal Generator";
const DESCRIPTION =
  "Generate on-brand Red Bee portal graphics at any pixel size and export them as PNG, JPEG or SVG.";

// Base URL for resolving the og-image to an absolute URL. Uses the deployment
// URL on Vercel, an explicit override if set, and localhost as a dev fallback.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Red Bee portal" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${inclusiveSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
