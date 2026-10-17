// Comptage de la littérature scientifique sur Europe PMC pour une liste de sujets candidats,
// afin de décider lesquels ajouter à la veille.
// AUCUN appel Claude : uniquement des requêtes Europe PMC (gratuites). Coût : 0 €.
//
// Pour chaque sujet, deux comptes (titre ou résumé, articles MEDLINE) :
//   - sur les 12 derniers mois (date d'entrée dans Europe PMC) ;
//   - sur 10 ans (année de publication 2016 à 2026).
// Filtre humain : le résumé doit mentionner des humains (participants, patients…) et le titre
// ne doit pas désigner d'animaux ou l'in vitro. Filtre approximatif, mais il retire l'essentiel.
// Le résultat est affiché dans le log et enregistré dans comptage-litterature.csv
// (téléchargeable dans les « Artifacts » du run GitHub).

const fs = require('fs');

const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';

// [nom en français, catégorie, termes anglais cherchés en expression exacte]
const CANDIDATS = [
  // Comptage du 17 oct. 2026 : régimes et stratégies nutritionnelles du sport
  ['Périodisation des glucides', 'Habitude', ['carbohydrate periodization', 'periodised carbohydrate', 'train low', 'sleep low']],
  ['Entraînement à jeun', 'Habitude', ['fasted exercise', 'fasted training', 'fasted state exercise']],
  ['Timing des nutriments', 'Habitude', ['nutrient timing', 'protein timing', 'post-exercise nutrition', 'pre-exercise meal', 'protein distribution']],
  ['Régime LCHF chez l\'athlète', 'Habitude', ['low-carbohydrate high-fat athletes', 'LCHF diet', 'keto-adaptation']],
  ['Perte de poids rapide (weight cutting)', 'Habitude', ['rapid weight loss', 'weight cutting', 'weight making']],
  ['Faible disponibilité énergétique (RED-S)', 'Habitude', ['low energy availability', 'relative energy deficiency in sport', 'RED-S']],
  ['Nutrition pendant l\'effort', 'Habitude', ['carbohydrate ingestion during exercise', 'sports drinks', 'in-race nutrition']],
];

// Filtre humain : le résumé doit mentionner des humains ; titres animaux ou in vitro exclus
const FILTRE_HUMAIN =
  '(ABSTRACT:(participants OR patients OR subjects OR adults OR children OR women OR men OR volunteers OR humans))';
const EXCLUSIONS_ANIMAL =
  'NOT TITLE:(rat OR rats OR mice OR mouse OR murine OR "in vitro" OR zebrafish OR broiler OR broilers OR piglets OR cattle OR cows OR sheep OR poultry OR dogs OR cats)';

function formaterDate(date) {
  return date.toISOString().split('T')[0];
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const data = await res.json();
    return data.hitCount || 0;
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
  const aujourdhui = new Date();
  const ilYAUnAn = new Date();
  ilYAUnAn.setDate(ilYAUnAn.getDate() - 365);
  const filtreAn = `(FIRST_IDATE:[${formaterDate(ilYAUnAn)} TO ${formaterDate(aujourdhui)}])`;
  const filtreDixAns = '(PUB_YEAR:[2016 TO 2026])';

  console.log(`Comptage de ${CANDIDATS.length} sujets sur Europe PMC (gratuit, aucun appel Claude).\n`);
  const lignes = [];

  for (const [nom, categorie, termes] of CANDIDATS) {
    const sujet = termes.map((t) => `(TITLE:"${t}" OR ABSTRACT:"${t}")`).join(' OR ');
    const base = `(${sujet}) AND (SRC:MED) AND ${FILTRE_HUMAIN} ${EXCLUSIONS_ANIMAL}`;
    const surUnAn = await compter(`${base} AND ${filtreAn}`);
    await pause(300);
    const surDixAns = await compter(`${base} AND ${filtreDixAns}`);
    await pause(300);
    const parSemaine = surUnAn === null ? null : Math.round((surUnAn * 7) / 365);
    lignes.push({ nom, categorie, surUnAn, surDixAns, parSemaine, termes: termes.join(' | ') });
    console.log(`  ${nom} : ${surUnAn ?? '?'} sur 12 mois, ${surDixAns ?? '?'} sur 10 ans`);
  }

  lignes.sort((a, b) => (b.surUnAn ?? -1) - (a.surUnAn ?? -1));

  console.log('\n##### Classement (du plus étudié au moins étudié sur 12 mois) #####');
  console.log('Sujet | Catégorie | 12 mois | 10 ans | environ par semaine');
  for (const l of lignes) {
    console.log(`${l.nom} | ${l.categorie} | ${l.surUnAn ?? '?'} | ${l.surDixAns ?? '?'} | ${l.parSemaine ?? '?'}`);
  }

  const echapper = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    'sujet,categorie,etudes_12_mois,etudes_10_ans,environ_par_semaine,termes',
    ...lignes.map((l) => [l.nom, l.categorie, l.surUnAn, l.surDixAns, l.parSemaine, l.termes].map(echapper).join(',')),
  ].join('\n');
  fs.writeFileSync('comptage-litterature.csv', '\uFEFF' + csv, 'utf8');
  console.log('\nFichier comptage-litterature.csv enregistré (voir « Artifacts » en bas de la page du run).');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
