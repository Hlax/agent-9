import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twin Staging",
  description: "Staging habitat preview",
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
