/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'santeetlongevite.vercel.app',
          },
        ],
        destination: 'https://sciencetruths.com/:path*',
        permanent: true,
      },
      // 8 nov. 2026 : ancienne adresse de l'article sur la sardine (slug modifié), signalée en 404 par Search Console
      {
        source: '/articles/la-sardine-que-dit-vraiment-la-science',
        destination: '/articles/la-sardine-benefices-poisson',
        permanent: true,
      },
      // 9 nov. 2026 : fiches désactivées, signalées en 404 par Search Console
      {
        source: '/habitudes/regime-nicoya',
        destination: '/habitudes/zones-bleues',
        permanent: true,
      },
      {
        source: '/aliments/huile-de-sardine',
        destination: '/aliments/huile-de-saumon',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
