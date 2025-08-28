import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sirius Pirólisis",
  description: "Landing page de Sirius Pirólisis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@geist-fonts/geist-sans@latest/font.css" />
        <style>{`:root { --font-geist-sans: 'Geist Sans', Arial, Helvetica, sans-serif; }`}</style>
      </head>
      <body className="antialiased" style={{ fontFamily: "var(--font-geist-sans)" }}>
        {children}
      </body>
    </html>
  );
}