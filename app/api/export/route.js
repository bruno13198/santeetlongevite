// Export de la bibliographie d'une fiche (27 oct. 2026).
// GET /api/export?type=aliment&slug=curcuma-poudre&format=csv (ou ris)
// + les mêmes filtres que la liste affichée : niveau, revues, tri, q, probleme.
// Renvoie un fichier à télécharger : un tableau CSV (pour Excel, séparateur « ; ») ou un fichier
// de références RIS (pour Zotero, EndNote, Mendeley). Au plus 2 000 études par export.
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

function nettoyerCsv(valeur) {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  return `"${texte.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function annee(date) {
  const m = String(date || '').match(/^(\d{4})/);
  return m ? m[1] : '';
}

function versCsv(etudes) {
  const entetes = [
    'Titre (français)', 'Titre original', 'Auteurs', 'Année', 'Date de publication',
    'Niveau de preuve', "Type d'étude", 'Participants', 'Lien', 'PMID',
  ];
  const lignes = etudes.map((e) =>
    [
      e.titre_traduit, e.titre_original, e.auteurs, annee(e.date_publication), e.date_publication,
      e.niveau_preuve, e.design_etude || e.type_etude, e.nb_participants, e.url_originale, e.pmid,
    ].map(nettoyerCsv).join(';')
  );
  // Le caractère BOM permet à Excel de lire correctement les accents.
  return '\uFEFF' + [entetes.map(nettoyerCsv).join(';'), ...lignes].join('\r\n');
}

function versRis(etudes) {
  return etudes
    .map((e) => {
      const lignes = ['TY  - JOUR'];
      if (e.titre_original) lignes.push(`TI  - ${e.titre_original}`);
      if (e.titre_traduit) lignes.push(`T2  - ${e.titre_traduit}`);
      for (const auteur of String(e.auteurs || '').split(/,\s*/).filter(Boolean)) {
        lignes.push(`AU  - ${auteur.replace(/\.$/, '')}`);
      }
      if (annee(e.date_publication)) lignes.push(`PY  - ${annee(e.date_publication)}`);
      if (e.date_publication) lignes.push(`DA  - ${String(e.date_publication).replace(/-/g, '/')}`);
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

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const type = params.get('type');
  const slug = params.get('slug');
  const format = params.get('format') === 'ris' ? 'ris' : 'csv';

  if (!TABLES[type] || !slug) {
    return new Response('Paramètres manquants.', { status: 400 });
  }

  const { data: sujet } = await supabase
    .from(TABLES[type])
    .select('id, actif')
    .eq('slug', slug)
    .maybeSingle();
  if (!sujet || sujet.actif === false) {
    return new Response('Fiche introuvable.', { status: 404 });
  }

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
  if (error) {
    return new Response("L'export n'a pas abouti. Réessayez dans un instant.", { status: 500 });
  }

  // Identifiant PubMed de chaque étude (colonne source_id), récupéré par lots
  const liste = etudes || [];
  const pmidParId = new Map();
  for (let i = 0; i < liste.length; i += 200) {
    const ids = liste.slice(i, i + 200).map((e) => e.id);
    const { data } = await supabase.from('etudes').select('id, source_id').in('id', ids);
    for (const ligne of data || []) pmidParId.set(ligne.id, ligne.source_id);
  }
  const etudesCompletes = liste.map((e) => ({ ...e, pmid: pmidParId.get(e.id) || '' }));

  const dateDuJour = new Date().toISOString().slice(0, 10);
  const nomFichier = `sciencetruths-${slug}-${dateDuJour}.${format}`;
  const contenu = format === 'ris' ? versRis(etudesCompletes) : versCsv(etudesCompletes);

  return new Response(contenu, {
    headers: {
      'Content-Type': format === 'ris' ? 'application/x-research-info-systems; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
      'Cache-Control': 'no-store',
    },
  });
}
