import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuración para standalone output (requerido para Docker)
  output: 'standalone',
  
  // @sirius/solicitudes se distribuye en TypeScript, sin build: lo transpila la
  // app que lo consume. Sin esta línea Next intenta ejecutar sus .ts tal cual.
  transpilePackages: ['@sirius/solicitudes'],

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
