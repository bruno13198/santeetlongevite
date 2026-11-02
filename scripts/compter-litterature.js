// Comptage de la littérature sur Europe PMC pour des fiches existantes (restauré et adapté le 1er nov. 2026).
// AUCUN appel Claude : uniquement des requêtes Europe PMC (gratuites). Coût : 0 €.
//
// Pour chaque slug (aliment, régime ou nutriment), le script lit ses termes de recherche en base
// et compte, sur la fenêtre choisie (date d'entrée dans Europe PMC, comme les imports) :
//   - le TOTAL des résultats : ce que le rattrapage lira (donc le coût du tri Haiku) ;
//   - les résultats CHEZ L'HOMME (filtre approximatif) : ce qui a une chance d'être retenu.
// Un grand écart entre les deux signale une fiche bruitée, dont il faut revoir les termes.
// Les termes « A + B » sont traités comme dans les imports (les deux expressions exigées).
//
// Variables d'environnement : SLUGS (séparés par des virgules), JOURS (fenêtre, 3650 par défaut).

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { clauseExclusion } = require('./mots-exclus-titre');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';
const JOURS = parseInt(process.env.JOURS || '3650', 10);
const SLUGS = (process.env.SLUGS || '').split(',').map((s) => s.trim()).filter(Boolean);

const FILTRE_HUMAIN =
  '(ABSTRACT:(participants OR patients OR subjects OR adults OR children OR women OR men OR volunteers OR humans))';
const EXCLUSIONS_ANIMAL =
  'NOT TITLE:(rat OR rats OR mice OR mouse OR murine OR "in vitro" OR zebrafish OR broiler OR broilers OR piglets OR cattle OR cows OR sheep OR poultry OR dogs OR cats)';

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formaterDate(date) {
  return date.toISOString().split('T')[0];
}

// Même construction que les imports : « A + B » exige les deux expressions.
function expression(terme) {
  const parties = String(terme).split('+').map((p) => p.trim()).filter(Boolean);
  return `(${parties.map((p) => `(TITLE:"${p}" OR ABSTRACT:"${p}")`).join(' AND ')})`;
}

// Retrouve la fiche dans les trois tables et construit sa requête « sujet ».
async function chercherFiche(slug) {
  const { data: a } = await supabase.from('aliments').select('nom, termes_recherche').eq('slug', slug).maybeSingle();
  if (a) return { type: 'aliment', nom: a.nom, sujet: (a.termes_recherche || []).map(expression).join(' OR ') };

  for (const table of ['habitudes_alimentaires', 'nutriments']) {
    const { data: f } = await supabase
      .from(table).select('nom, terme_recherche, est_terme_mesh, termes_texte').eq('slug', slug).maybeSingle();
    if (f) {
      const parties = [];
      if (f.terme_recherche && f.terme_recherche.trim() !== '') {
        parties.push(f.est_terme_mesh ? `(MESH:"${f.terme_recherche}")` : expression(f.terme_recherche.split(' ').join(' + ')));
      }
      for (const t of f.termes_texte || []) if (t && t.trim() !== '') parties.push(expression(t));
      return { type: table === 'nutriments' ? 'nutriment' : 'régime', nom: f.nom, sujet: parties.join(' OR ') };
    }
  }
  return null;
}

async function compter(requete, tentative = 1) {
  try {
    const res = await fetch(URL_EUROPEPMC_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: requete, format: 'json', pageSize: '1', resultType: 'lite' }).toString(),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`erreur ${res.status}`);
    return (await res.json()).hitCount || 0;
  } catch (e) {
    if (tentative < 5) {
      await pause(3000 * tentative);
      return compter(requete, tentative + 1);
    }
    console.log(`  Échec Europe PMC : ${e.message}`);
    return null;
  }
}

async function main() {
  if (SLUGS.length === 0) throw new Error('Aucun slug indiqué.');
  const debut = new Date();
  debut.setDate(debut.getDate() - JOURS);
  const filtreDate = `(FIRST_IDATE:[${formaterDate(debut)} TO ${formaterDate(new Date())}])`;

  console.log(`Comptage de ${SLUGS.length} fiche(s) sur ${JOURS} jours (gratuit, aucun appel Claude).\n`);
  const lignes = [];

  for (const slug of SLUGS) {
    const fiche = await chercherFiche(slug);
    if (!fiche || !fiche.sujet) {
      console.log(`  ${slug} : fiche introuvable ou sans termes`);
      continue;
    }
        // Même requête que le rattrapage : sujet, MEDLINE, mots exclus des titres, fenêtre de dates.
    const base = `(${fiche.sujet}) AND (SRC:MED) ${clauseExclusion()} AND ${filtreDate}`;
    const total = await compter(base);
    await pause(300);
    const humain = await compter(`${base} AND ${FILTRE_HUMAIN} ${EXCLUSIONS_ANIMAL}`);
    await pause(300);
    const bruit = total && humain !== null ? Math.round(100 * (1 - humain / total)) : null;
    lignes.push({ slug, nom: fiche.nom, type: fiche.type, total, humain, bruit });
    console.log(`  ${slug} : ${total ?? '?'} au total, ${humain ?? '?'} chez l'homme (bruit ${bruit ?? '?'} %)`);
  }

  lignes.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  console.log('\n##### Classement (du plus volumineux au moins volumineux) #####');
  console.log('Fiche | Type | Total | Chez l\'homme | Bruit');
  for (const l of lignes) {
    const alerte = l.bruit !== null && l.bruit >= 80 ? '  ⚠️ termes à revoir' : '';
    console.log(`${l.nom} | ${l.type} | ${l.total ?? '?'} | ${l.humain ?? '?'} | ${l.bruit ?? '?'} %${alerte}`);
  }

  const echapper = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    'slug,nom,type,total,chez_l_homme,bruit_pourcent',
    ...lignes.map((l) => [l.slug, l.nom, l.type, l.total, l.humain, l.bruit].map(echapper).join(',')),
  ].join('\n');
  fs.writeFileSync('comptage-litterature.csv', '\uFEFF' + csv, 'utf8');
  console.log('\nFichier comptage-litterature.csv enregistré (voir « Artifacts » en bas de la page du run).');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
