// Export de la bibliographie d'une fiche (27 oct. 2026, refonte 29 oct. 2026).
// GET /api/export?type=aliment&slug=curcuma-poudre&format=csv (ou ris, html)
// + les mêmes filtres que la liste affichée : niveau, revues, tri, q, probleme.
// GET /api/export?etude=<id>&format=txt : référence Vancouver d'une seule étude (lien « Citer »).
//
// Formats, alignés sur les pratiques professionnelles :
//   csv  : tableau de preuves (une ligne par étude : référence, titres, type, effectif, niveau,
//          résultats principaux, identifiants), pour Excel (séparateur « ; »)
//   ris  : références complètes pour Zotero, EndNote, Mendeley
//   txt  : référence(s) Vancouver complète(s)
//   html : 19 nov. 2026 : liste de références Vancouver numérotée, dans une page à copier ou imprimer
// Au plus 2 000 études par export. Revue, volume, numéro, pages et DOI viennent d'Europe PMC
// (colonnes remplies par scripts/rattraper-metadonnees.js).
// Toutes les références Vancouver (bouton « Citer », fichier txt, page html) passent par la même
// fonction referenceVancouver : elles sont toujours identiques.
import { createClient } from '@supabase/supabase-js';
import { niveauHas } from '../../../lib/niveauHas';

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
const CHEMINS = { aliment: '/aliments', habitude: '/habitudes', nutriment: '/nutriments', probleme: '/sante' };
const FORMATS = {
  csv: { extension: 'csv', type: 'text/csv; charset=utf-8' },
  ris: { extension: 'ris', type: 'application/x-research-info-systems; charset=utf-8' },
  txt: { extension: 'txt', type: 'text/plain; charset=utf-8' },
  html: { extension: 'html', type: 'text/html; charset=utf-8' },
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

function echapperHtml(texte) {
  return String(texte || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nettoyerCsv(valeur) {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  return `"${texte.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function annee(date) {
  const m = String(date || '').match(/^(\d{4})/);
  return m ? m[1] : '';
}

// 19 nov. 2026 : l'identifiant n'est un PMID que s'il est purement numérique
// (sinon : prépublication, identifiant PMC…).
function pmidValide(e) {
  return /^\d+$/.test(String(e.pmid || '')) ? String(e.pmid) : '';
}

// 19 nov. 2026 : pages au format Vancouver, fin de plage abrégée (284-287 → 284-7, 99-104 inchangé).
function abregerPages(pages) {
  const texte = String(pages || '').trim().replace(/[–—]/g, '-');
  const m = texte.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return texte;
  const [, debut, fin] = m;
  if (fin.length !== debut.length || Number(fin) <= Number(debut)) return `${debut}-${fin}`;
  let i = 0;
  while (i < debut.length && debut[i] === fin[i]) i++;
  return `${debut}-${fin.slice(i)}`;
}

// Référence Vancouver complète (norme NLM/ICMJE) :
// Auteurs (6 au plus, puis « et al. »). Titre original. Revue abrégée. Année;Volume(Numéro):Pages. doi:… PMID: ….
function referenceVancouver(e) {
  const auteurs = String(e.auteurs || '').replace(/\.$/, '').split(/,\s*/).filter(Boolean);
  const partieAuteurs = auteurs.length > 6
    ? `${auteurs.slice(0, 6).join(', ')}, et al.`
    : auteurs.length ? `${auteurs.join(', ')}.` : '';

  let titre = sansBalises(e.titre_original || e.titre_traduit);
  if (titre && !/[.?!]$/.test(titre)) titre += '.';

  const an = annee(e.date_publication);
  // Abréviation NLM : sans points (« Am. J. Clin. Nutr. » → « Am J Clin Nutr »).
  const revue = e.revue_abregee ? String(e.revue_abregee).replace(/\.(?=\s|$)/g, '').trim() : e.revue;
  let source = '';
  if (revue) {
    let detail = an;
    if (e.volume) detail += `;${e.volume}`;
    if (e.numero) detail += `(${e.numero})`;
    if (e.pages) detail += `:${abregerPages(e.pages)}`;
    source = detail ? `${revue}. ${detail}.` : `${revue}.`;
  } else if (an) {
    source = `${an}.`;
  }

  const morceaux = [partieAuteurs, titre, source];
  if (e.doi) morceaux.push(`doi:${e.doi}.`);
  if (pmidValide(e)) morceaux.push(`PMID: ${pmidValide(e)}.`);
  return morceaux.filter(Boolean).join(' ');
}

// Tableau de preuves : une ligne par étude.
function versCsv(etudes) {
  const entetes = [
    'Référence', 'Titre (français)', 'Titre original', "Type d'étude", 'Effectif',
    'Niveau de preuve (Oxford)', 'Équivalent HAS (approximatif)', 'Résultats principaux',
    'Année', 'Revue', 'DOI', 'PMID', 'Lien',
  ];
  const lignes = etudes.map((e) =>
    [
      referenceVancouver(e), sansBalises(e.titre_traduit), sansBalises(e.titre_original),
      e.design_etude || e.type_etude, e.nb_participants, e.niveau_preuve,
      niveauHas(e.design_etude, e.ajustement_preuve), e.resume_reformule,
      annee(e.date_publication), e.revue, e.doi, pmidValide(e), e.url_originale,
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
        const [debut, fin] = String(e.pages).replace(/[–—]/g, '-').split('-');
        lignes.push(`SP  - ${debut}`);
        if (fin) lignes.push(`EP  - ${fin}`);
      }
      if (e.doi) lignes.push(`DO  - ${e.doi}`);
      if (e.url_originale) lignes.push(`UR  - ${e.url_originale}`);
      if (pmidValide(e)) lignes.push(`AN  - PMID:${pmidValide(e)}`);
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

// 19 nov. 2026 : page de références Vancouver numérotées, à copier ou imprimer.
function versPageHtml(etudes, contexte) {
  const dateFr = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  });
  const n = etudes.length;
  const items = etudes.map((e) => `<li>${echapperHtml(referenceVancouver(e))}</li>`).join('\n');
  const sousTitre = [contexte.nom, ...contexte.filtres].filter(Boolean).map(echapperHtml).join(' · ');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Références bibliographiques${contexte.nom ? ` · ${echapperHtml(contexte.nom)}` : ''} | ScienceTruths</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #222; max-width: 820px; margin: 40px auto; padding: 0 20px; line-height: 1.55; }
  .site { font-family: sans-serif; font-size: 13px; margin: 0 0 4px; }
  .site a { color: #27500A; text-decoration: none; font-weight: bold; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .contexte { font-size: 17px; margin: 0 0 4px; }
  .meta { font-family: sans-serif; font-size: 13px; color: #6B6E63; margin: 0 0 18px; }
  .meta a { color: #6B6E63; }
  .outils { font-family: sans-serif; margin: 0 0 22px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .outils button { padding: 8px 14px; font-size: 14px; border-radius: 6px; cursor: pointer; border: 1px solid #27500A; }
  #copier { background: #27500A; color: #fff; }
  #imprimer { background: #fff; color: #27500A; }
  #etat { font-size: 13px; color: #27500A; }
  ol { padding-left: 2.4em; margin: 0; }
  li { margin-bottom: 10px; overflow-wrap: anywhere; }
  .note { font-family: sans-serif; font-size: 12px; color: #6B6E63; margin-top: 28px; border-top: 1px solid #e5e2da; padding-top: 12px; }
  @media print { .outils, .site { display: none; } body { margin: 0; max-width: none; } }
</style>
</head>
<body>
<p class="site"><a href="https://sciencetruths.com">ScienceTruths</a></p>
<h1>Références bibliographiques</h1>
${sousTitre ? `<p class="contexte">${sousTitre}</p>` : ''}
<p class="meta">${n} référence${n > 1 ? 's' : ''} · format Vancouver (NLM) · liste établie le ${dateFr}${contexte.url ? ` · <a href="${echapperHtml(contexte.url)}">voir la fiche</a>` : ''}</p>
${n > 0 ? `<div class="outils">
  <button type="button" id="copier">Copier toute la liste</button>
  <button type="button" id="imprimer">Imprimer</button>
  <span id="etat" aria-live="polite"></span>
</div>
<ol id="liste">
${items}
</ol>` : '<p>Aucune étude ne correspond à cette sélection.</p>'}
<p class="note">Titres dans la langue originale de publication. Références établies automatiquement à partir des données d'Europe PMC : vérifiez-les avant toute publication.</p>
<script>
  (function () {
    var copier = document.getElementById('copier');
    var imprimer = document.getElementById('imprimer');
    var etat = document.getElementById('etat');
    if (imprimer) imprimer.addEventListener('click', function () { window.print(); });
    if (!copier) return;
    copier.addEventListener('click', function () {
      var lignes = Array.prototype.map.call(document.querySelectorAll('#liste li'), function (li, i) {
        return (i + 1) + '. ' + li.textContent.trim();
      });
      var texte = lignes.join('\\n');
      function selectionner() {
        var plage = document.createRange();
        plage.selectNodeContents(document.getElementById('liste'));
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(plage);
        etat.textContent = 'Liste sélectionnée : faites Ctrl + C pour la copier.';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).then(function () {
          etat.textContent = 'Liste copiée \\u2713';
        }, selectionner);
      } else {
        selectionner();
      }
    });
  })();
</script>
</body>
</html>`;
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
    contexte: { nom: '', filtres: [], url: '' },
  };
}

// Toutes les études de la sélection affichée sur une fiche.
async function chargerSelection(params) {
  const type = params.get('type');
  const slug = params.get('slug');
  if (!TABLES[type] || !slug) return { erreur: 400 };

  const { data: sujet } = await supabase
    .from(TABLES[type])
    .select('id, nom, actif')
    .eq('slug', slug)
    .maybeSingle();
  if (!sujet || sujet.actif === false) return { erreur: 404 };

  const niveau = parseInt(params.get('niveau'), 10);
  const niveauValide = niveau >= 1 && niveau <= 5 ? niveau : null;
  const recherche = (params.get('q') || '').slice(0, 100);
  const probleme = (params.get('probleme') || '').slice(0, 80);
  const tri = ['ancien', 'niveau'].includes(params.get('tri')) ? params.get('tri') : 'recent';

  const { data: etudes, error } = await supabase.rpc('liste_etudes', {
    p_type: type,
    p_sujet: sujet.id,
    p_niveau: niveauValide,
    p_inclure_revues: params.get('revues') === '1',
    p_recherche: recherche || null,
    p_ordre: tri,
    p_limite: LIMITE_EXPORT,
    p_decalage: 0,
    p_probleme: probleme || null,
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

  // Description de la sélection, pour l'en-tête de la page html
  let nomProbleme = '';
  if (probleme) {
    const { data } = await supabase.from('problemes_sante').select('nom').eq('slug', probleme).maybeSingle();
    nomProbleme = data?.nom || '';
  }
  const filtres = [
    nomProbleme,
    niveauValide ? `Niveau de preuve ${niveauValide}` : '',
    recherche ? `Recherche « ${recherche} »` : '',
    tri === 'niveau' ? 'Plus solides d’abord' : tri === 'ancien' ? 'Plus anciennes d’abord' : '',
  ];
  const parametresFiche = new URLSearchParams();
  if (niveauValide) parametresFiche.set('niveau', String(niveauValide));
  if (params.get('revues') === '1') parametresFiche.set('revues', '1');
  if (tri !== 'recent') parametresFiche.set('tri', tri);
  if (recherche) parametresFiche.set('q', recherche);
  if (probleme) parametresFiche.set('probleme', probleme);
  const chaine = parametresFiche.toString();

  return {
    etudes: liste.map((e) => {
      const b = bibloParId.get(e.id) || {};
      return { ...e, ...b, resume_reformule: b.resume_reformule || e.resume_reformule, pmid: b.source_id || '' };
    }),
    nomBase: slug,
    contexte: {
      nom: sujet.nom || '',
      filtres,
      url: `https://sciencetruths.com${CHEMINS[type]}/${slug}${chaine ? `?${chaine}` : ''}`,
    },
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

  // Page de références : affichée dans le navigateur, jamais indexée.
  if (format === 'html') {
    return new Response(versPageHtml(resultat.etudes, resultat.contexte), {
      headers: {
        'Content-Type': FORMATS.html.type,
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    });
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
