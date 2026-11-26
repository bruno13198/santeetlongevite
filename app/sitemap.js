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
// 10 nov. 2026 : les fiches de moins de 3 études ne figurent plus dans le plan du site
// (elles sont aussi en noindex) ; elles y reviennent d'elles-mêmes dès 3 études
// (vue Supabase nb_etudes_par_sujet).
// 23 nov. 2026 : seuil ramené à 1 étude : seules les pages vides sont exclues du plan du site.
// 26 nov. 2026 : ajout de « L'étude de la semaine » (liste et numéros, datés de leur parution).
const SEUIL_ETUDES = 1;

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
    { data: nombres, error: erreurNombres },
    { data: nombresProblemes, error: erreurNombresProblemes },
    { data: etudesSemaine },
  ] = await Promise.all([
    supabase.from('aliments').select('id, slug').eq('actif', true).range(0, 3999),
    supabase.from('habitudes_alimentaires').select('id, slug').eq('actif', true).range(0, 999),
    supabase.from('nutriments').select('id, slug').eq('actif', true).range(0, 1999),
    supabase.from('articles').select('slug').eq('publie', true).range(0, 999),
    supabase.from('dates_mise_a_jour_sujets').select('type, sujet_id, derniere').range(0, 4999),
    supabase.from('problemes_sante').select('id, slug').eq('actif', true),
    supabase.from('dates_mise_a_jour_problemes').select('probleme_id, derniere'),
    supabase.from('nb_etudes_par_sujet').select('type, sujet_id, nb').range(0, 4999),
    // 12 nov. 2026 : même seuil pour les pages de problèmes de santé.
    supabase.from('nb_etudes_par_probleme').select('probleme_id, nb'),
    supabase.from('etudes_semaine').select('slug, date_parution').eq('publie', true).range(0, 999),
  ]);

  const dateParSujet = new Map((dates || []).map((d) => [`${d.type}:${d.sujet_id}`, d.derniere]));
  for (const d of datesProblemes || []) dateParSujet.set(`probleme:${d.probleme_id}`, d.derniere);

  const nbParSujet = new Map((nombres || []).map((n) => [`${n.type}:${n.sujet_id}`, Number(n.nb)]));
  for (const n of nombresProblemes || []) nbParSujet.set(`probleme:${n.probleme_id}`, Number(n.nb));
  // En cas d'erreur de lecture des nombres, on garde toutes les fiches plutôt que d'en retirer à tort
  const assezEtudes = (type, id) =>
    (type === 'probleme' ? erreurNombresProblemes : erreurNombres) ||
    (nbParSujet.get(`${type}:${id}`) || 0) >= SEUIL_ETUDES;

  const versUrls = (lignes, type, prefixe) =>
    (lignes || [])
      .filter((ligne) => assezEtudes(type, ligne.id))
      .map((ligne) => {
        const derniere = dateParSujet.get(`${type}:${ligne.id}`);
        return {
          url: `${baseUrl}/${prefixe}/${ligne.slug}`,
          ...(derniere ? { lastModified: new Date(derniere) } : {}),
        };
      });

  // L'étude de la semaine : la liste prend la date du numéro le plus récent.
  const numeros = etudesSemaine || [];
  const dernierNumero = numeros.reduce((max, n) => (n.date_parution > max ? n.date_parution : max), '');

  return [
    { url: baseUrl },
    { url: `${baseUrl}/a-propos` },
    { url: `${baseUrl}/veille-scientifique` },
    { url: `${baseUrl}/sante` },
    { url: `${baseUrl}/articles` },
    { url: `${baseUrl}/niveaux-de-preuve` },
    { url: `${baseUrl}/etude-de-la-semaine`, ...(dernierNumero ? { lastModified: new Date(dernierNumero) } : {}) },
    ...numeros.map((n) => ({ url: `${baseUrl}/etude-de-la-semaine/${n.slug}`, lastModified: new Date(n.date_parution) })),
    ...(articles || []).map((article) => ({ url: `${baseUrl}/articles/${article.slug}` })),
    ...versUrls(problemes, 'probleme', 'sante'),
    ...versUrls(aliments, 'aliment', 'aliments'),
    ...versUrls(habitudes, 'habitude', 'habitudes'),
    ...versUrls(nutriments, 'nutriment', 'nutriments'),
  ];
}
