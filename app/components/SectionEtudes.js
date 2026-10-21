// Section « Études scientifiques » d'une fiche (21 oct. 2026).
// Composant serveur : lit les paramètres de l'adresse (niveau, revues, tri, q, page), demande à la base
// les compteurs par niveau et la seule page de 20 études à afficher, puis confie l'affichage à ListeEtudes.
// Ainsi, une fiche reste légère quel que soit son nombre d'études.
import { createClient } from '@supabase/supabase-js';
import ListeEtudes from './ListeEtudes';

const TAILLE_PAGE = 20;

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
    tri: sp?.tri === 'ancien' ? 'ancien' : 'recent',
    q,
    page: page >= 1 ? page : 1,
  };
}

async function chargerComptes(type, sujetId, recherche) {
  const { data } = await supabase.rpc('comptes_etudes', {
    p_type: type,
    p_sujet: sujetId,
    p_recherche: recherche || null,
  });
  const comptes = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const ligne of data || []) comptes[ligne.niveau] = Number(ligne.nb);
  return comptes;
}

// type : 'aliment', 'habitude', 'nutriment' ou 'probleme' ; chemin : adresse de la fiche (ex. /aliments/curcuma-poudre)
export default async function SectionEtudes({ type, sujetId, chemin, searchParams }) {
  const parametres = lireParametres(searchParams);

  // Compteurs avec la recherche éventuelle, et total de la fiche sans recherche (pour le titre).
  const comptes = await chargerComptes(type, sujetId, parametres.q);
  const comptesTotal = parametres.q ? await chargerComptes(type, sujetId, null) : comptes;
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
    });
    etudes = data || [];
  }

  return (
    <>
      <h2>Études scientifiques ({totalFiche})</h2>
      {totalFiche === 0 ? (
        <p style={{ color: '#6B6E63' }}>Aucune étude pour le moment.</p>
      ) : (
        <ListeEtudes
          etudes={etudes}
          comptes={comptes}
          totalSelection={totalSelection}
          parametres={parametres}
          chemin={chemin}
        />
      )}
    </>
  );
}
