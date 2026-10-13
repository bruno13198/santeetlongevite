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
  // Comptage du 13 oct. 2026 : sujets étudiés absents de la veille
  // Compléments
  ['NMN et NR (précurseurs du NAD)', 'Complément', ['nicotinamide mononucleotide', 'nicotinamide riboside']],
  ['Myo-inositol', 'Complément', ['myo-inositol', 'inositol supplementation']],
  ['L-théanine', 'Complément', ['theanine']],
  ['Glycine', 'Complément', ['glycine supplementation', 'glycine ingestion']],
  ['GABA', 'Complément', ['GABA supplementation', 'oral GABA', 'gamma-aminobutyric acid supplementation']],
  ['Colostrum bovin', 'Complément', ['bovine colostrum']],
  ['Lactoferrine', 'Complément', ['lactoferrin supplementation', 'oral lactoferrin']],
  ['Acide alpha-lipoïque', 'Complément', ['alpha-lipoic acid', 'lipoic acid supplementation']],
  ['Astaxanthine', 'Complément', ['astaxanthin']],
  ['Spermidine', 'Complément', ['spermidine intake', 'spermidine supplementation', 'dietary spermidine']],
  ['Huile MCT', 'Complément', ['medium-chain triglycerides', 'MCT oil']],
  ['Phytostérols et stanols', 'Complément', ['phytosterols', 'plant sterols', 'plant stanols']],
  ['Glutathion oral', 'Complément', ['oral glutathione', 'glutathione supplementation']],
  // Nutriments
  ['Isoflavones de soja', 'Nutriment', ['soy isoflavones', 'isoflavone supplementation', 'isoflavone intake']],
  ['Cholestérol alimentaire', 'Nutriment', ['dietary cholesterol', 'cholesterol intake']],
  ['Anthocyanes', 'Nutriment', ['anthocyanin intake', 'anthocyanin supplementation', 'dietary anthocyanins']],
  // Plantes
  ['Camomille (matricaire)', 'Plante', ['chamomile', 'Matricaria chamomilla', 'Matricaria recutita']],
  ['Mélisse', 'Plante', ['lemon balm', 'Melissa officinalis']],
  ['Lavande (voie orale)', 'Plante', ['Silexan', 'oral lavender']],
  ['Hibiscus', 'Plante', ['Hibiscus sabdariffa', 'hibiscus tea']],
  ['Maté', 'Plante', ['yerba mate', 'Ilex paraguariensis']],
  ['Boswellia', 'Plante', ['Boswellia serrata', 'boswellia']],
  ['Centella asiatica', 'Plante', ['Centella asiatica', 'gotu kola']],
  ['Tulsi (basilic sacré)', 'Plante', ['Ocimum sanctum', 'Ocimum tenuiflorum', 'holy basil', 'tulsi']],
  ['Feuille d\'olivier', 'Plante', ['olive leaf extract']],
  ['Pélargonium', 'Plante', ['Pelargonium sidoides', 'EPs 7630']],
  ['Andrographis', 'Plante', ['Andrographis paniculata']],
  ['Réglisse', 'Plante', ['licorice', 'liquorice', 'Glycyrrhiza glabra']],
  ['Aloe vera (voie orale)', 'Plante', ['oral aloe vera', 'aloe vera juice', 'aloe vera supplementation']],
  ['Tongkat ali', 'Plante', ['Eurycoma longifolia', 'tongkat ali']],
  ['Cordyceps', 'Plante', ['Cordyceps']],
  // Aliments et additifs
  ['Glutamate (MSG)', 'Additif', ['monosodium glutamate']],
  ['Nitrites (additifs)', 'Additif', ['nitrite intake', 'dietary nitrite', 'sodium nitrite']],
  ['Émulsifiants', 'Additif', ['dietary emulsifiers', 'carboxymethylcellulose', 'polysorbate 80']],
  ['Colorants alimentaires', 'Additif', ['food colorants', 'artificial food colors', 'food dyes']],
  ['Xylitol et polyols', 'Aliment', ['xylitol', 'sorbitol intake', 'polyols']],
  ['Insectes comestibles', 'Aliment', ['edible insects', 'insect protein', 'cricket powder']],
  ['Lait de chamelle', 'Aliment', ['camel milk']],
  ['Lait chocolaté', 'Aliment', ['chocolate milk']],
  // Régimes et habitudes
  ['Régime carnivore', 'Habitude', ['carnivore diet', 'animal-based diet']],
  ['Régime alcalin', 'Habitude', ['alkaline diet', 'dietary acid load']],
  ['Jeûne du Ramadan', 'Habitude', ['Ramadan fasting', 'Ramadan intermittent fasting']],
  ['Diversification alimentaire du nourrisson', 'Habitude', ['complementary feeding', 'early allergen introduction']],
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
