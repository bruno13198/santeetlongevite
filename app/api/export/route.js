// Export de la bibliographie d'une fiche (27 oct. 2026, refonte 29 oct. 2026).
// GET /api/export?type=aliment&slug=curcuma-poudre&format=csv (ou ris)
// + les mêmes filtres que la liste affichée : niveau, revues, tri, q, probleme.
// GET /api/export?etude=<id>&format=txt : référence Vancouver d'une seule étude (lien « Citer »).
//
// Formats, alignés sur les pratiques professionnelles :
//   csv : tableau de preuves (une ligne par étude : référence, titres, type, effectif, niveau,
//         résultats principaux, identifiants), pour Excel (séparateur « ; »)
//   ris : références complètes pour Zotero, EndNote, Mendeley
//   txt : référence(s) Vancouver complète(s)
// Au plus 2 000 études par export. Revue, volume, numéro, pages et DOI viennent d'Europe PMC
// (colonnes remplies par scripts/rattraper-metadonnees.js).
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const LIMITE_EXPORT = 2000;
const TABLES = {
  aliment: 'aliments',
  habitude: 'habitudes_alimentaires',
  nutriment: 'nutriments',
  probleme: 'problemes_sante',
};
const FORMATS = {
  csv: { extension: 'csv', type: 'text/csv; charset=utf-8' },
  ris: { extension: 'ris', type: 'application/x-research-info-systems; charset=utf-8' },
  txt: { extension: 'txt', type: 'text/plain; charset=utf-8' },
};
const COLONNES_BIBLIO = 'id, source_id, revue, revue_abregee, volume, numero, pages, doi, resume_reformule';

// Retire les balises HTML (ex. <i>Allium</i>), y compris quand elles sont encodées (&lt;i&gt;).
function sansBalises(texte) {
  return String(texte || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nettoyerCsv(valeur) {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  return `"${texte.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function annee(date) {
  const m = String(date || '').match(/^(\d{4})/);
  return m ? m[1] : '';
}

// Référence Vancouver complète :
// Auteurs (6 au plus, puis « et al. »). Titre. Revue. Année;Volume(Numéro):Pages. doi:… PMID: ….
function referenceVancouver(e) {
  const auteurs = String(e.auteurs || '').replace(/\.$/, '').split(/,\s*/).filter(Boolean);
  const partieAuteurs = auteurs.length > 6
    ? `${auteurs.slice(0, 6).join(', ')}, et al.`
    : auteurs.length ? `${auteurs.join(', ')}.` : '';

  let titre = sansBalises(e.titre_original || e.titre_traduit);
  if (titre && !/[.?!]$/.test(titre)) titre += '.';

  const an = annee(e.date_publication);
  const revue = e.revue_abregee || e.revue;
  let source = '';
  if (revue) {
    let detail = an;
    if (e.volume) detail += `;${e.volume}`;
    if (e.numero) detail += `(${e.numero})`;
    if (e.pages) detail += `:${e.pages}`;
    source = detail ? `${revue}. ${detail}.` : `${revue}.`;
  } else if (an) {
    source = `${an}.`;
  }

  const morceaux = [partieAuteurs, titre, source];
  if (e.doi) morceaux.push(`doi:${e.doi}.`);
  if (e.pmid) morceaux.push(`PMID: ${e.pmid}.`);
  return morceaux.filter(Boolean).join(' ');
}

// Tableau de preuves : une ligne par étude.
function versCsv(etudes) {
  const entetes = [
    'Référence', 'Titre (français)', 'Titre original', "Type d'étude", 'Effectif',
    'Niveau de preuve (Oxford)', 'Résultats principaux', 'Année', 'Revue', 'DOI', 'PMID', 'Lien',
  ];
  const lignes = etudes.map((e) =>
    [
      referenceVancouver(e), sansBalises(e.titre_traduit), sansBalises(e.titre_original),
      e.design_etude || e.type_etude, e.nb_participants, e.niveau_preuve, e.resume_reformule,
      annee(e.date_publication), e.revue, e.doi, e.pmid, e.url_originale,
    ].map(nettoyerCsv).join(';')
  );
  // Le caractère BOM permet à Excel de lire correctement les accents.
  return '\uFEFF' + [entetes.map(nettoyerCsv).join(';'), ...lignes].join('\r\n');
}

function versRis(etudes) {
  return etudes
    .map((e) => {
      const lignes = ['TY  - JOUR'];
      if (e.titre_original) lignes.push(`TI  - ${sansBalises(e.titre_original)}`);
      if (e.titre_traduit) lignes.push(`TT  - ${sansBalises(e.titre_traduit)}`);
      for (const auteur of String(e.auteurs || '').split(/,\s*/).filter(Boolean)) {
        lignes.push(`AU  - ${auteur.replace(/\.$/, '')}`);
      }
      if (annee(e.date_publication)) lignes.push(`PY  - ${annee(e.date_publication)}`);
      if (e.date_publication) lignes.push(`DA  - ${String(e.date_publication).replace(/-/g, '/')}`);
      if (e.revue) lignes.push(`T2  - ${e.revue}`);
      if (e.revue_abregee) lignes.push(`J2  - ${e.revue_abregee}`);
      if (e.volume) lignes.push(`VL  - ${e.volume}`);
      if (e.numero) lignes.push(`IS  - ${e.numero}`);
      if (e.pages) {
        const [debut, fin] = String(e.pages).split('-');
        lignes.push(`SP  - ${debut}`);
        if (fin) lignes.push(`EP  - ${fin}`);
      }
      if (e.doi) lignes.push(`DO  - ${e.doi}`);
      if (e.url_originale) lignes.push(`UR  - ${e.url_originale}`);
      if (e.pmid) lignes.push(`AN  - PMID:${e.pmid}`);
      const note = [
        e.niveau_preuve ? `Niveau de preuve ScienceTruths : ${e.niveau_preuve}` : '',
        e.design_etude || e.type_etude || '',
        e.nb_participants ? `${e.nb_participants} participants` : '',
      ].filter(Boolean).join(' · ');
      if (note) lignes.push(`N1  - ${note}`);
      lignes.push('ER  - ');
      return lignes.join('\r\n');
    })
    .join('\r\n\r\n');
}

// Plusieurs études : liste numérotée (avec BOM pour les accents) ; une seule : la référence seule.
function versVancouver(etudes) {
  if (etudes.length === 1) return referenceVancouver(etudes[0]);
  return '\uFEFF' + etudes.map((e, i) => `${i + 1}. ${referenceVancouver(e)}`).join('\r\n');
}

// Une seule étude, lue directement dans la table etudes.
async function chargerUneEtude(etudeId) {
  if (!/^[0-9a-f-]{36}$/i.test(etudeId)) return { erreur: 400 };
  const { data: etude } = await supabase
    .from('etudes')
    .select(`titre_original, titre_traduit, auteurs, date_publication, url_originale, niveau_preuve, design_etude, type_etude, nb_participants, ${COLONNES_BIBLIO}`)
    .eq('id', etudeId)
    .maybeSingle();
  if (!etude) return { erreur: 404 };
  return {
    etudes: [{ ...etude, pmid: etude.source_id || '' }],
    nomBase: `etude-${etude.source_id || etude.id.slice(0, 8)}`,
  };
}

// Toutes les études de la sélection affichée sur une fiche.
async function chargerSelection(params) {
  const type = params.get('type');
  const slug = params.get('slug');
  if (!TABLES[type] || !slug) return { erreur: 400 };

  const { data: sujet } = await supabase
    .from(TABLES[type])
    .select('id, actif')
    .eq('slug', slug)
    .maybeSingle();
  if (!sujet || sujet.actif === false) return { erreur: 404 };

  const niveau = parseInt(params.get('niveau'), 10);
  const { data: etudes, error } = await supabase.rpc('liste_etudes', {
    p_type: type,
    p_sujet: sujet.id,
    p_niveau: niveau >= 1 && niveau <= 5 ? niveau : null,
    p_inclure_revues: params.get('revues') === '1',
    p_recherche: (params.get('q') || '').slice(0, 100) || null,
    p_ordre: params.get('tri') === 'ancien' ? 'ancien' : 'recent',
    p_limite: LIMITE_EXPORT,
    p_decalage: 0,
    p_probleme: (params.get('probleme') || '').slice(0, 80) || null,
  });
  if (error) return { erreur: 500 };

  // Métadonnées bibliographiques et résumé de chaque étude, récupérés par lots
  const liste = etudes || [];
  const bibloParId = new Map();
  for (let i = 0; i < liste.length; i += 200) {
    const ids = liste.slice(i, i + 200).map((e) => e.id);
    const { data } = await supabase.from('etudes').select(COLONNES_BIBLIO).in('id', ids);
    for (const ligne of data || []) bibloParId.set(ligne.id, ligne);
  }
  return {
    etudes: liste.map((e) => {
      const b = bibloParId.get(e.id) || {};
      return { ...e, ...b, resume_reformule: b.resume_reformule || e.resume_reformule, pmid: b.source_id || '' };
    }),
    nomBase: slug,
  };
}

const MESSAGES = {
  400: 'Paramètres manquants.',
  404: 'Fiche ou étude introuvable.',
  500: "L'export n'a pas abouti. Réessayez dans un instant.",
};

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const format = FORMATS[params.get('format')] ? params.get('format') : 'csv';
  const etudeId = params.get('etude');

  const resultat = etudeId ? await chargerUneEtude(etudeId) : await chargerSelection(params);
  if (resultat.erreur) {
    return new Response(MESSAGES[resultat.erreur], { status: resultat.erreur });
  }

  const dateDuJour = new Date().toISOString().slice(0, 10);
  const prefixe = format === 'csv' ? 'tableau-de-preuves' : 'references';
  const nomFichier = `sciencetruths-${prefixe}-${resultat.nomBase}-${dateDuJour}.${FORMATS[format].extension}`;
  const contenu =
    format === 'ris' ? versRis(resultat.etudes)
    : format === 'txt' ? versVancouver(resultat.etudes)
    : versCsv(resultat.etudes);

  return new Response(contenu, {
    headers: {
      'Content-Type': FORMATS[format].type,
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
      'Cache-Control': 'no-store',
    },
  });
}
