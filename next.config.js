/** @type {import('next').NextConfig} */

// O Next 16 usa Turbopack por padrão. A Vercel injeta uma config webpack
// própria no build ("Applying modifyConfig from Vercel"), e o Next para ao
// encontrar webpack sem turbopack configurado — ele não sabe se a config
// webpack é intencional ou resíduo de uma migração incompleta.
//
// Este projeto não tem config customizada, então declarar turbopack vazio
// diz ao Next: "Turbopack é intencional, pode seguir".
const nextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options',            value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',      value: 'nosniff' },
          { key: 'Referrer-Policy',             value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security',   value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-DNS-Prefetch-Control',      value: 'on' },
          { key: 'Permissions-Policy',          value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
