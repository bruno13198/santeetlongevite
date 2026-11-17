/** @type {import('next').NextConfig} */

// 16 nov. 2026 : paramètres d'adresse qui signalent une fiche filtrée (calculée en direct).
// Sans aucun d'eux, la fiche est servie depuis sa copie en cache.
const FILTRES = ['niveau', 'revues', 'tri', 'q', 'page', 'probleme'].map((key) => ({ type: 'query', key }));

// Sections dont la version sans filtre est servie depuis le cache (17 nov. 2026 : toutes les fiches).
const SECTIONS_EN_CACHE = ['aliments', 'nutriments', 'habitudes', 'sante'];

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
    ];
  },

  // 16 nov. 2026 : les fiches sans filtre sont servies depuis leur copie en cache (même adresse
  // pour le visiteur), pour ne plus recalculer la page à chaque visite.
  async rewrites() {
    return {
      beforeFiles: SECTIONS_EN_CACHE.map((section) => ({
        source: `/${section}/:slug`,
        missing: FILTRES,
        destination: `/cache/${section}/:slug`,
      })),
    };
  },
};

export default nextConfig;
