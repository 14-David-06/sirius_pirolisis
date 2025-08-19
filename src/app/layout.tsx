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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Museo+Slab:wght@100;300;500;700;900;1000&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="font-museo-slab antialiased">
        {children}
      </body>
    </html>
  );
}