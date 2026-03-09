import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twin Studio",
  description: "Private operator interface for the Twin",
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
