// 27 oct. 2026 : Google n'explore plus les adresses de filtres et de pagination des fiches
// (niveau, page, tri, recherche, revues) ni les routes techniques. Ces adresses renvoient toutes
// vers l'adresse principale de la fiche (balise canonique) : les explorer gaspillait le temps
// que Google consacre au site, au détriment des fiches pas encore indexées.
const ADRESSE_SITE = 'https:' + '//sciencetruths.com';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/*?*niveau=',
        '/*?*page=',
        '/*?*tri=',
        '/*?*q=',
        '/*?*revues=',
      ],
    },
    sitemap: `${ADRESSE_SITE}/sitemap.xml`,
  };
}
