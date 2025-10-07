import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuración para standalone output (requerido para Docker)
  output: 'standalone',
  
  // Configuración experimental
  serverExternalPackages: [],
  
  // Headers de seguridad
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
