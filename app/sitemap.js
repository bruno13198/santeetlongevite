import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 10 oct. 2026 : ajout des habitudes et des nutriments.
// 12 oct. 2026 : vraie date de mise à jour pour chaque fiche (date de sa dernière étude,
// vue Supabase dates_mise_a_jour_sujets). Sans étude, ou pour les pages fixes et les
// articles, pas de date plutôt qu'une date inventée.
// 21 oct. 2026 : ajout des pages par problème de santé (/sante et /sante/[slug]).
export default async function sitemap() {
  const baseUrl = 'https://sciencetruths.com';

  const [
    { data: aliments },
    { data: habitudes },
    { data: nutriments },
    { data: articles },
    { data: dates },
    { data: problemes },
    { data: datesProblemes },
  ] = await Promise.all([
    supabase.from('aliments').select('id, slug').eq('actif', true).range(0, 3999),
    supabase.from('habitudes_alimentaires').select('id, slug').eq('actif', true).range(0, 999),
    supabase.from('nutriments').select('id, slug').eq('actif', true).range(0, 1999),
    supabase.from('articles').select('slug').eq('publie', true).range(0, 999),
    supabase.from('dates_mise_a_jour_sujets').select('type, sujet_id, derniere').range(0, 4999),
    supabase.from('problemes_sante').select('id, slug').eq('actif', true),
    supabase.from('dates_mise_a_jour_problemes').select('probleme_id, derniere'),
  ]);

  const dateParSujet = new Map((dates || []).map((d) => [`${d.type}:${d.sujet_id}`, d.derniere]));
  for (const d of datesProblemes || []) dateParSujet.set(`probleme:${d.probleme_id}`, d.derniere);

  const versUrls = (lignes, type, prefixe) =>
    (lignes || []).map((ligne) => {
      const derniere = dateParSujet.get(`${type}:${ligne.id}`);
      return {
        url: `${baseUrl}/${prefixe}/${ligne.slug}`,
        ...(derniere ? { lastModified: new Date(derniere) } : {}),
      };
    });

  return [
    { url: baseUrl },
    { url: `${baseUrl}/a-propos` },
    { url: `${baseUrl}/veille-scientifique` },
    { url: `${baseUrl}/sante` },
    { url: `${baseUrl}/articles` },
    { url: `${baseUrl}/niveaux-de-preuve` },
    ...(articles || []).map((article) => ({ url: `${baseUrl}/articles/${article.slug}` })),
    ...versUrls(problemes, 'probleme', 'sante'),
    ...versUrls(aliments, 'aliment', 'aliments'),
    ...versUrls(habitudes, 'habitude', 'habitudes'),
    ...versUrls(nutriments, 'nutriment', 'nutriments'),
  ];
}
