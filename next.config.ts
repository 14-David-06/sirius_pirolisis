import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuración para standalone output (requerido para Docker)
  output: 'standalone',
  
  // @sirius/solicitudes se distribuye en TypeScript, sin build: lo transpila la
  // app que lo consume. Sin esta línea Next intenta ejecutar sus .ts tal cual.
  transpilePackages: ['@sirius/solicitudes'],

  // Configuración experimental
  serverExternalPackages: [],

  // El PDF de la remisión lee `public/logo.png` del disco. En una función
  // serverless el trazado solo copia lo que se importa, y sin esto el documento
  // que se adjunta al Core y viaja por correo saldría sin logo (el generador
  // sigue funcionando, pero el documento que recibe el cliente se ve a medias).
  outputFileTracingIncludes: {
    '/api/recibir/**/*': ['./public/logo.png'],
    '/api/pirolisis/**/*': ['./public/logo.png'],
  },

  // Headers de seguridad
  async headers() {
    // La recepción pública: la usa alguien de afuera con un enlace que es una
    // credencial. Sin caché (un proxy no puede servirle a otro la respuesta), sin
    // indexar, sin Referer hacia ningún recurso y sin poder enmarcarla en otro
    // sitio (un iframe ajeno podría inducir el toque en «Confirmar»).
    const recepcion = [
      { key: 'Cache-Control', value: 'no-store, max-age=0' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ];
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
      { source: '/recibir', headers: recepcion },
      { source: '/api/recibir/:path*', headers: recepcion },
    ];
  },
};

export default nextConfig;
