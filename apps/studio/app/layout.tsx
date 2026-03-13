import type { Metadata } from "next";
import "./globals.css";
import { StudioNav } from "./components/studio-nav";

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
      <body>
        <header style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee", background: "#fafafa" }}>
          <StudioNav />
        </header>
        {children}
      </body>
    </html>
  );
}
