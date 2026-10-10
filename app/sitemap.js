import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 10 oct. 2026 : ajout des fiches habitudes (absentes jusqu'ici) et des fiches nutriments.
export default async function sitemap() {
  const baseUrl = 'https://sciencetruths.com';

  const [{ data: aliments }, { data: habitudes }, { data: nutriments }, { data: articles }] = await Promise.all([
    supabase.from('aliments').select('slug').eq('actif', true).range(0, 3999),
    supabase.from('habitudes_alimentaires').select('slug').eq('actif', true).range(0, 999),
    supabase.from('nutriments').select('slug').eq('actif', true).range(0, 1999),
    supabase.from('articles').select('slug').eq('publie', true).range(0, 999),
  ]);

  const versUrls = (lignes, prefixe) =>
    (lignes || []).map((ligne) => ({
      url: `${baseUrl}/${prefixe}/${ligne.slug}`,
      lastModified: new Date(),
    }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/a-propos`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/veille-scientifique`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/articles`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/niveaux-de-preuve`,
      lastModified: new Date(),
    },
    ...versUrls(articles, 'articles'),
    ...versUrls(aliments, 'aliments'),
    ...versUrls(habitudes, 'habitudes'),
    ...versUrls(nutriments, 'nutriments'),
  ];
}
