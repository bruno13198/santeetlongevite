// Audit de couverture de la base nutrition (8 nov. 2026). Script ponctuel, en lecture seule :
// à supprimer avec son workflow une fois l'audit terminé.
// 1. Demande à Europe PMC toutes les méta-analyses d'essais randomisés et de cohortes prospectives
//    du domaine de la nutrition (mots-clés MeSH et mots du titre), depuis ANNEE_DEBUT.
// 2. Les compare à la base : déjà en base, déjà écartées par un tri, ou jamais vues.
// 3. Écrit les méta-analyses jamais vues dans audit-couverture.csv (récupéré comme artefact GitHub).
// Aucun appel à Claude, rien n'est écrit en base.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ANNEE_DEBUT = parseInt(process.env.ANNEE_DEBUT || '2016', 10);
const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';
const TAILLE_PAGE = 1000;

// Même filtre que les rattrapages « hauts niveaux » des scripts d'import.
const FILTRE_HAUTS_NIVEAUX =
  '(PUB_TYPE:"Meta-Analysis" AND (ABSTRACT:"randomized controlled trials" OR ABSTRACT:"randomised controlled trials" OR ABSTRACT:"randomized controlled trial" OR ABSTRACT:"randomised controlled trial" OR ABSTRACT:"randomized trials" OR ABSTRACT:"randomised trials" OR ABSTRACT:"RCTs" OR ABSTRACT:"prospective cohort studies" OR ABSTRACT:"prospective cohort study" OR ABSTRACT:"prospective cohorts" OR ABSTRACT:"prospective studies"))';

// 8 nov. 2026 (deuxième version) : mots du titre uniquement. Les mots-clés MeSH ramenaient
// surtout de la chirurgie et des médicaments.
const SUJET_NUTRITION = [
  'supplementation', 'supplement', 'supplements', 'dietary', 'diet', 'diets', 'intake',
  'consumption', 'nutrition', 'nutritional', 'food', 'foods', 'fasting', 'vitamin', 'vitamins',
  'probiotic', 'probiotics', 'prebiotic', 'prebiotics', 'beverages', 'fortification',
].map((mot) => `TITLE:"${mot}"`).join(' OR ');

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appelerEuropePMC(parametres, tentative = 1) {
  try {
    const res = await fetch(URL_EUROPEPMC_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parametres).toString(),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
    return await res.json();
  } catch (e) {
    if (tentative < 5) {
      const delai = 5000 * tentative;
      console.log(`  ${e.message}, nouvelle tentative dans ${delai / 1000}s (${tentative + 1}/5)...`);
      await pause(delai);
      return appelerEuropePMC(parametres, tentative + 1);
    }
    throw e;
  }
}

// Toutes les valeurs d'une colonne, lues par tranches de 1000 lignes (limite de Supabase).
async function chargerColonne(table, colonne, filtre) {
  const valeurs = new Set();
  for (let debut = 0; ; debut += 1000) {
    let requete = supabase.from(table).select(colonne).range(debut, debut + 999);
    if (filtre) requete = filtre(requete);
    const { data, error } = await requete;
    if (error) throw new Error(`${table} : ${error.message}`);
    for (const ligne of data) if (ligne[colonne]) valeurs.add(String(ligne[colonne]));
    if (data.length < 1000) break;
  }
  return valeurs;
}

function champCsv(valeur) {
  return `"${String(valeur ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;
}

async function main() {
  const aujourdhui = new Date().toISOString().split('T')[0];
  const requete = `(${SUJET_NUTRITION}) AND (SRC:MED) AND ${FILTRE_HAUTS_NIVEAUX} AND (FIRST_PDATE:[${ANNEE_DEBUT}-01-01 TO ${aujourdhui}])`;
  console.log(`Audit de couverture depuis ${ANNEE_DEBUT}.`);

  // 1. Méta-analyses du domaine sur Europe PMC
  const resultats = new Map();
  let cursorMark = '*';
  let total = 0;
  for (;;) {
    const data = await appelerEuropePMC({
      query: requete,
      format: 'json',
      pageSize: String(TAILLE_PAGE),
      cursorMark,
      resultType: 'lite',
    });
    total = data.hitCount || 0;
    const page = data.resultList?.result || [];
    for (const r of page) {
      const id = r.id || r.pmid;
      if (id && !resultats.has(id)) resultats.set(id, r);
    }
    console.log(`  ${resultats.size} / ${total} méta-analyses lues...`);
    if (page.length === 0 || !data.nextCursorMark || data.nextCursorMark === cursorMark) break;
    cursorMark = data.nextCursorMark;
    await pause(300);
  }

  // 2. Ce que la base connaît déjà
  console.log('Lecture de la base...');
  const enBase = await chargerColonne('etudes', 'source_id', (q) => q.eq('source', 'Europe PMC'));
  const rejetes = new Set();
  for (const table of ['candidats_rejetes', 'candidats_rejetes_habitudes', 'candidats_rejetes_nutriments']) {
    for (const id of await chargerColonne(table, 'source_id')) rejetes.add(id);
  }
  console.log(`  ${enBase.size} études en base, ${rejetes.size} identifiants déjà écartés.`);

  // 3. Comparaison
  let nbEnBase = 0;
  let nbRejetes = 0;
  const jamaisVues = [];
  for (const [id, r] of resultats) {
    if (enBase.has(String(id))) nbEnBase++;
    else if (rejetes.has(String(id))) nbRejetes++;
    else jamaisVues.push(r);
  }
  jamaisVues.sort((a, b) => String(b.pubYear || '').localeCompare(String(a.pubYear || '')));

  const lignes = ['pmid,annee,revue,titre'];
  for (const r of jamaisVues) {
    lignes.push([r.id || r.pmid, r.pubYear, r.journalTitle, r.title].map(champCsv).join(','));
  }
  fs.writeFileSync('audit-couverture.csv', lignes.join('\n'), 'utf8');

  const parAnnee = {};
  for (const r of jamaisVues) parAnnee[r.pubYear || '?'] = (parAnnee[r.pubYear || '?'] || 0) + 1;

  console.log('\n##### Bilan #####');
  console.log(`Méta-analyses du domaine sur Europe PMC : ${resultats.size}`);
  console.log(`Déjà en base : ${nbEnBase} | déjà écartées par un tri : ${nbRejetes} | jamais vues : ${jamaisVues.length}`);
  console.log(`Jamais vues par année : ${Object.entries(parAnnee).sort().map(([a, n]) => `${a} : ${n}`).join(' · ')}`);
  console.log('\nFichier audit-couverture.csv prêt (artefact « audit-couverture » en bas de la page du run).');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
