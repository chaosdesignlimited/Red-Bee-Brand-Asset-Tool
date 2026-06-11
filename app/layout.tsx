import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Red Bee Portal Generator",
  description:
    "Generate on-brand Red Bee portal graphics at any pixel size and export them as PNG, JPEG or SVG.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
