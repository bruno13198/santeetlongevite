// Section « Études scientifiques » d'une fiche (21 oct. 2026).
// Composant serveur : lit les paramètres de l'adresse (niveau, revues, tri, q, page), demande à la base
// les compteurs par niveau et la seule page de 20 études à afficher, puis confie l'affichage à ListeEtudes.
// Ainsi, une fiche reste légère quel que soit son nombre d'études.
// 27 oct. 2026 : filtre par problème de santé (paramètre « probleme », slug de problemes_sante).
// 13 nov. 2026 : sens de l'effet de chaque étude affichée (vue sens_effectif sur les fiches,
// etudes_problemes sur les pages de problème), pour les étiquettes de la liste.
import { createClient } from '@supabase/supabase-js';
import ListeEtudes from './ListeEtudes';
import CartePreuves from './CartePreuves';

const TAILLE_PAGE = 20;
const MAX_ETIQUETTES = 3;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function lireParametres(sp) {
  const niveau = parseInt(sp?.niveau, 10);
  const page = parseInt(sp?.page, 10);
  const q = typeof sp?.q === 'string' ? sp.q.trim().slice(0, 100) : '';
  return {
    niveau: niveau >= 1 && niveau <= 5 ? niveau : null,
    revues: sp?.revues === '1',
    tri: ['ancien', 'niveau'].includes(sp?.tri) ? sp.tri : 'recent',
    q,
    page: page >= 1 ? page : 1,
    probleme: typeof sp?.probleme === 'string' ? sp.probleme.slice(0, 80) : '',
  };
}

async function chargerComptes(type, sujetId, recherche, probleme) {
  const { data } = await supabase.rpc('comptes_etudes', {
    p_type: type,
    p_sujet: sujetId,
    p_recherche: recherche || null,
    p_probleme: probleme || null,
  });
  const comptes = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const ligne of data || []) comptes[ligne.niveau] = Number(ligne.nb);
  return comptes;
}

// Sens de l'effet des études affichées : { idEtude: [{ slug, nom, sens }] }.
// En cas d'erreur, la liste s'affiche simplement sans étiquettes.
async function chargerSens(type, sujetId, etudes, problemeFiltre) {
  const resultat = {};
  if (etudes.length === 0) return resultat;
  const ids = etudes.map((e) => e.id);

  const { data: problemes } = await supabase.from('problemes_sante').select('id, slug, nom');
  const problemeParId = new Map((problemes || []).map((p) => [p.id, p]));

  const { data } =
    type === 'probleme'
      ? await supabase.from('etudes_problemes').select('etude_id, probleme_id, sens').eq('probleme_id', sujetId).in('etude_id', ids)
      : await supabase
          .from('sens_effectif')
          .select('etude_id, probleme_id, sens')
          .eq('fiche_type', type)
          .eq('fiche_id', sujetId)
          .in('etude_id', ids);

  for (const l of data || []) {
    if (!l.sens || l.sens === 'sans_objet') continue;
    const p = problemeParId.get(l.probleme_id);
    if (!p) continue;
    if (problemeFiltre && p.slug !== problemeFiltre) continue;
    if (!resultat[l.etude_id]) resultat[l.etude_id] = [];
    if (resultat[l.etude_id].length < MAX_ETIQUETTES) resultat[l.etude_id].push({ slug: p.slug, nom: p.nom, sens: l.sens });
  }
  return resultat;
}

// type : 'aliment', 'habitude', 'nutriment' ou 'probleme' ; chemin : adresse de la fiche (ex. /aliments/curcuma-poudre)
export default async function SectionEtudes({ type, sujetId, chemin, searchParams }) {
  const parametres = lireParametres(searchParams);

  // Problèmes de santé présents dans la fiche (menu de filtre), sauf sur les pages de problème elles-mêmes
  let problemes = [];
  if (type !== 'probleme') {
    const { data } = await supabase.rpc('problemes_du_sujet', { p_type: type, p_sujet: sujetId });
    problemes = data || [];
  }
  if (parametres.probleme && !problemes.some((p) => p.slug === parametres.probleme)) parametres.probleme = '';

  // Compteurs avec la recherche et le problème éventuels, et total de la fiche sans filtre (pour le titre).
  const comptes = await chargerComptes(type, sujetId, parametres.q, parametres.probleme);
  const comptesTotal =
    parametres.q || parametres.probleme ? await chargerComptes(type, sujetId, null, null) : comptes;
  const totalFiche = Object.values(comptesTotal).reduce((s, n) => s + n, 0);

  // Nombre d'études correspondant à la sélection affichée
  const totalSelection = parametres.niveau
    ? comptes[parametres.niveau]
    : comptes[0] + comptes[1] + comptes[2] + comptes[3] + comptes[4] + (parametres.revues ? comptes[5] : 0);

  const nbPages = Math.max(1, Math.ceil(totalSelection / TAILLE_PAGE));
  if (parametres.page > nbPages) parametres.page = nbPages;

  let etudes = [];
  if (totalSelection > 0) {
    const { data } = await supabase.rpc('liste_etudes', {
      p_type: type,
      p_sujet: sujetId,
      p_niveau: parametres.niveau,
      p_inclure_revues: parametres.revues,
      p_recherche: parametres.q || null,
      p_ordre: parametres.tri,
      p_limite: TAILLE_PAGE,
      p_decalage: (parametres.page - 1) * TAILLE_PAGE,
      p_probleme: parametres.probleme || null,
    });
    etudes = data || [];
  }

  const sensParEtude = await chargerSens(type, sujetId, etudes, parametres.probleme);

  return (
    <>
      <h2>Études scientifiques ({totalFiche})</h2>
      {totalFiche > 0 && (
        // 27 oct. 2026 : carte des preuves (camembert des niveaux et tableau problèmes × niveaux)
        <CartePreuves type={type} sujetId={sujetId} chemin={chemin} comptes={comptesTotal} />
      )}
      {totalFiche === 0 ? (
        <p style={{ color: '#6B6E63' }}>Aucune étude pour le moment.</p>
      ) : (
        <ListeEtudes
          etudes={etudes}
          comptes={comptes}
          totalSelection={totalSelection}
          parametres={parametres}
          chemin={chemin}
          problemes={problemes}
          sensParEtude={sensParEtude}
        />
      )}
    </>
  );
}
