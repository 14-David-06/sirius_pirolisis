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
      <body className="font-arial antialiased">
        {children}
      </body>
    </html>
  );
}