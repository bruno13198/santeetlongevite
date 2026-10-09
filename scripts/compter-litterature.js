// Comptage de la littérature scientifique sur Europe PMC pour une liste de sujets candidats
// (aliments transformés, plats, boissons...), afin de décider lesquels ajouter à la veille.
// AUCUN appel Claude : uniquement des requêtes Europe PMC (gratuites). Coût : 0 €.
//
// Pour chaque sujet, deux comptes (titre ou résumé, articles MEDLINE) :
//   - sur les 12 derniers mois (date d'entrée dans Europe PMC) ;
//   - sur 10 ans (année de publication 2016 à 2026).
// Le compte est brut (avant tout tri) : il inclut aussi les études animales ou hors sujet.
// Le résultat est affiché dans le log et enregistré dans comptage-litterature.csv
// (téléchargeable dans les « Artifacts » du run GitHub).

const fs = require('fs');

const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';

// [nom en français, catégorie, termes anglais cherchés en expression exacte]
const CANDIDATS = [
  // Comptage du 9 oct. 2026 : nutriments, compléments, aliments et habitudes manquants
  // Repères (déjà en base, pour calibrer le seuil)
  ['Régime méditerranéen', 'Repère', ['Mediterranean diet']],
  ['Ail', 'Repère', ['garlic']],
  ['Curcuma', 'Repère', ['turmeric', 'curcumin']],
  ['Herbes de Provence', 'Repère', ['herbes de Provence', 'Provence herbs']],

  // Vitamines
  ['Vitamine A et bêta-carotène', 'Nutriment', ['vitamin A', 'retinol', 'beta-carotene']],
  ['Vitamine B1 (thiamine)', 'Nutriment', ['thiamine', 'thiamin', 'vitamin B1']],
  ['Vitamine B2 (riboflavine)', 'Nutriment', ['riboflavin', 'vitamin B2']],
  ['Vitamine B3 (niacine)', 'Nutriment', ['niacin', 'nicotinamide', 'vitamin B3']],
  ['Vitamine B5 (acide pantothénique)', 'Nutriment', ['pantothenic acid', 'vitamin B5']],
  ['Vitamine B6', 'Nutriment', ['vitamin B6', 'pyridoxine']],
  ['Vitamine B8 (biotine)', 'Nutriment', ['biotin']],
  ['Vitamine B9 (folates)', 'Nutriment', ['folate', 'folic acid']],
  ['Vitamine B12', 'Nutriment', ['vitamin B12', 'cobalamin']],
  ['Vitamine C', 'Nutriment', ['vitamin C', 'ascorbic acid']],
  ['Vitamine D', 'Nutriment', ['vitamin D', 'cholecalciferol']],
  ['Vitamine E', 'Nutriment', ['vitamin E', 'tocopherol']],
  ['Vitamine K', 'Nutriment', ['vitamin K', 'phylloquinone', 'menaquinone']],
  ['Choline', 'Nutriment', ['choline intake', 'choline supplementation', 'dietary choline']],
  ['Multivitamines', 'Complément', ['multivitamin']],

  // Minéraux
  ['Calcium', 'Nutriment', ['calcium intake', 'calcium supplementation', 'dietary calcium']],
  ['Fer', 'Nutriment', ['iron supplementation', 'iron intake', 'dietary iron', 'iron supplement']],
  ['Magnésium', 'Nutriment', ['magnesium supplementation', 'magnesium intake', 'dietary magnesium']],
  ['Zinc', 'Nutriment', ['zinc supplementation', 'zinc intake', 'dietary zinc']],
  ['Sélénium', 'Nutriment', ['selenium supplementation', 'selenium intake', 'dietary selenium']],
  ['Iode', 'Nutriment', ['iodine intake', 'iodine supplementation', 'iodine status']],
  ['Potassium', 'Nutriment', ['potassium intake', 'dietary potassium', 'potassium supplementation']],
  ['Phosphore', 'Nutriment', ['phosphorus intake', 'dietary phosphorus', 'phosphate intake']],
  ['Cuivre', 'Nutriment', ['copper intake', 'dietary copper', 'copper supplementation']],
  ['Manganèse', 'Nutriment', ['manganese intake', 'dietary manganese']],
  ['Chrome', 'Nutriment', ['chromium supplementation', 'chromium picolinate']],
  ['Molybdène', 'Nutriment', ['molybdenum intake', 'dietary molybdenum']],
  ['Fluor', 'Nutriment', ['fluoride intake', 'water fluoridation', 'fluoride supplementation']],
  ['Bore', 'Nutriment', ['boron supplementation', 'boron intake', 'dietary boron']],

  // Lipides
  ['Oméga-3 ALA', 'Nutriment', ['alpha-linolenic acid']],
  ['Oméga-3 EPA/DHA', 'Nutriment', ['eicosapentaenoic acid', 'docosahexaenoic acid', 'omega-3 fatty acids', 'n-3 fatty acids']],
  ['Oméga-6', 'Nutriment', ['omega-6 fatty acids', 'n-6 fatty acids', 'linoleic acid intake']],
  ['Oméga-7', 'Nutriment', ['palmitoleic acid', 'omega-7']],
  ['Acides gras saturés', 'Nutriment', ['saturated fat', 'saturated fatty acids']],
  ['Acides gras trans', 'Nutriment', ['trans fat', 'trans fatty acids']],
  ['Acide linoléique conjugué (CLA)', 'Complément', ['conjugated linoleic acid']],

  // Glucides et fibres
  ['Fibres alimentaires', 'Nutriment', ['dietary fiber', 'dietary fibre']],
  ['Sucres ajoutés', 'Nutriment', ['added sugar', 'added sugars', 'free sugars']],
  ['Amidon résistant', 'Nutriment', ['resistant starch']],
  ['Inuline et FOS', 'Nutriment', ['inulin', 'fructooligosaccharides', 'fructo-oligosaccharides']],
  ['Bêta-glucanes', 'Nutriment', ['beta-glucan', 'beta-glucans']],
  ['Psyllium', 'Complément', ['psyllium']],
  ['Glucomannane', 'Complément', ['glucomannan', 'konjac']],
  ['Gomme de guar', 'Complément', ['guar gum']],

  // Protéines et acides aminés
  ['Protéines alimentaires', 'Nutriment', ['dietary protein', 'protein intake', 'protein supplementation']],
  ['Whey (lactosérum)', 'Complément', ['whey protein']],
  ['Caséine', 'Complément', ['casein supplementation', 'casein protein', 'micellar casein']],
  ['Protéine de pois', 'Complément', ['pea protein']],
  ['Collagène', 'Complément', ['collagen peptides', 'collagen hydrolysate', 'hydrolyzed collagen', 'collagen supplementation']],
  ['BCAA et leucine', 'Complément', ['branched-chain amino acids', 'leucine supplementation']],
  ['Glutamine', 'Complément', ['glutamine supplementation']],
  ['Arginine', 'Complément', ['arginine supplementation', 'L-arginine']],
  ['Citrulline', 'Complément', ['citrulline']],
  ['Tryptophane et 5-HTP', 'Complément', ['tryptophan supplementation', '5-hydroxytryptophan', '5-HTP']],
  ['Bêta-alanine', 'Complément', ['beta-alanine']],
  ['HMB', 'Complément', ['beta-hydroxy-beta-methylbutyrate', 'HMB supplementation']],
  ['Créatine', 'Complément', ['creatine supplementation', 'creatine monohydrate']],
  ['Carnitine', 'Complément', ['carnitine supplementation', 'L-carnitine']],
  ['Bétaïne', 'Complément', ['betaine supplementation']],
  ['Taurine', 'Complément', ['taurine supplementation', 'taurine intake']],
  ['NAC (N-acétylcystéine)', 'Complément', ['N-acetylcysteine']],
  ['SAMe', 'Complément', ['S-adenosylmethionine', 'S-adenosyl-L-methionine']],

  // Autres composés
  ['Polyphénols', 'Nutriment', ['polyphenols', 'polyphenol intake']],
  ['Flavonoïdes', 'Nutriment', ['flavonoids', 'flavonoid intake']],
  ['Quercétine', 'Nutriment', ['quercetin']],
  ['Resvératrol', 'Nutriment', ['resveratrol']],
  ['Lycopène', 'Nutriment', ['lycopene']],
  ['Lutéine et zéaxanthine', 'Nutriment', ['lutein', 'zeaxanthin']],
  ['Sulforaphane', 'Nutriment', ['sulforaphane']],
  ['Caféine', 'Nutriment', ['caffeine']],
  ['Nitrates alimentaires', 'Nutriment', ['dietary nitrate', 'nitrate supplementation']],
  ['Capsaïcine', 'Complément', ['capsaicin', 'capsinoids']],
  ['Cétones exogènes', 'Complément', ['exogenous ketones', 'ketone ester', 'ketone supplement']],
  ['Bicarbonate de sodium', 'Complément', ['sodium bicarbonate supplementation', 'bicarbonate ingestion']],
  ['Coenzyme Q10', 'Complément', ['coenzyme Q10', 'ubiquinol']],
  ['Mélatonine', 'Complément', ['melatonin supplementation', 'exogenous melatonin', 'melatonin administration']],
  ['Probiotiques', 'Complément', ['probiotic', 'probiotics']],
  ['Saccharomyces boulardii', 'Complément', ['Saccharomyces boulardii']],
  ['Berbérine', 'Complément', ['berberine']],
  ['Glucosamine', 'Complément', ['glucosamine']],
  ['Chondroïtine', 'Complément', ['chondroitin']],
  ['MSM', 'Complément', ['methylsulfonylmethane']],

  // Plantes en complément
  ['Ashwagandha', 'Complément', ['ashwagandha', 'Withania somnifera']],
  ['Ginseng', 'Complément', ['ginseng', 'Panax ginseng']],
  ['Éleuthérocoque', 'Complément', ['Eleutherococcus', 'Siberian ginseng']],
  ['Rhodiola', 'Complément', ['Rhodiola rosea', 'rhodiola']],
  ['Maca', 'Complément', ['maca', 'Lepidium meyenii']],
  ['Bacopa', 'Complément', ['Bacopa monnieri']],
  ['Millepertuis', 'Complément', ['St John\'s wort', 'St. John\'s wort', 'Hypericum perforatum']],
  ['Valériane', 'Complément', ['valerian', 'Valeriana officinalis']],
  ['Kava', 'Complément', ['kava', 'Piper methysticum']],
  ['Passiflore', 'Complément', ['passionflower', 'Passiflora incarnata']],
  ['Camomille', 'Complément', ['chamomile', 'Matricaria chamomilla']],
  ['Ginkgo', 'Complément', ['Ginkgo biloba']],
  ['Huperzine', 'Complément', ['huperzine']],
  ['Pin maritime (Pycnogénol)', 'Complément', ['Pycnogenol', 'maritime pine bark']],
  ['Extrait de pépins de raisin', 'Complément', ['grape seed extract']],
  ['Aubépine', 'Complément', ['hawthorn', 'Crataegus']],
  ['Marron d\'Inde', 'Complément', ['horse chestnut', 'Aesculus hippocastanum']],
  ['Échinacée', 'Complément', ['Echinacea']],
  ['Astragale', 'Complément', ['Astragalus membranaceus']],
  ['Griffe du chat', 'Complément', ['cat\'s claw', 'Uncaria tomentosa']],
  ['Chardon-marie', 'Complément', ['milk thistle', 'silymarin', 'Silybum marianum']],
  ['Réglisse', 'Complément', ['licorice', 'liquorice', 'Glycyrrhiza glabra']],
  ['Menthe poivrée (huile)', 'Complément', ['peppermint oil']],
  ['Orme rouge', 'Complément', ['slippery elm']],
  ['Séné', 'Complément', ['senna']],
  ['Cascara', 'Complément', ['cascara sagrada']],
  ['Actée à grappes noires', 'Complément', ['black cohosh', 'Cimicifuga racemosa', 'Actaea racemosa']],
  ['Gattilier', 'Complément', ['chasteberry', 'Vitex agnus-castus']],
  ['Trèfle rouge', 'Complément', ['red clover', 'Trifolium pratense']],
  ['Dong quai', 'Complément', ['dong quai', 'Angelica sinensis']],
  ['Igname sauvage', 'Complément', ['wild yam', 'Dioscorea villosa']],
  ['Huile d\'onagre', 'Complément', ['evening primrose oil']],
  ['Palmier nain (saw palmetto)', 'Complément', ['saw palmetto', 'Serenoa repens']],
  ['Tribulus', 'Complément', ['Tribulus terrestris']],
  ['Épimédium', 'Complément', ['Epimedium', 'horny goat weed']],
  ['Yohimbe', 'Complément', ['yohimbe', 'yohimbine']],
  ['Gymnema', 'Complément', ['Gymnema sylvestre']],
  ['Margose', 'Complément', ['bitter melon', 'Momordica charantia']],
  ['Mûrier blanc', 'Complément', ['white mulberry', 'mulberry leaf', 'Morus alba']],
  ['Garcinia', 'Complément', ['Garcinia cambogia', 'hydroxycitric acid']],
  ['Café vert', 'Complément', ['green coffee bean', 'green coffee extract']],
  ['Orange amère', 'Complément', ['bitter orange', 'Citrus aurantium', 'synephrine']],
  ['Guarana', 'Complément', ['guarana', 'Paullinia cupana']],
  ['Maté', 'Complément', ['yerba mate', 'Ilex paraguariensis']],
  ['Griffe du diable', 'Complément', ['devil\'s claw', 'Harpagophytum']],
  ['Écorce de saule', 'Complément', ['willow bark']],
  ['Grande camomille', 'Complément', ['feverfew', 'Tanacetum parthenium']],
  ['Pétasite', 'Complément', ['butterbur', 'Petasites hybridus']],
  ['Cartilage de requin', 'Complément', ['shark cartilage']],
  ['Hibiscus', 'Complément', ['Hibiscus sabdariffa', 'hibiscus tea']],
  ['Cynorrhodon', 'Complément', ['rose hip', 'rosehip']],
  ['Noni', 'Complément', ['noni juice', 'Morinda citrifolia']],
  ['Mangoustan', 'Complément', ['mangosteen', 'Garcinia mangostana']],
  ['Propolis', 'Complément', ['propolis']],
  ['CBD (cannabidiol)', 'Complément', ['cannabidiol']],
  ['Hydraste', 'Complément', ['goldenseal', 'Hydrastis canadensis']],
  ['Prêle', 'Complément', ['horsetail', 'Equisetum arvense']],
  ['Houblon', 'Complément', ['Humulus lupulus', 'hop extract']],

  // Aliments manquants
  ['Sirop de glucose-fructose', 'Aliment', ['high-fructose corn syrup', 'high fructose corn syrup']],
  ['Xylitol', 'Aliment', ['xylitol']],
  ['Sorbitol', 'Aliment', ['sorbitol']],
  ['Maltitol', 'Aliment', ['maltitol']],
  ['Saccharine', 'Aliment', ['saccharin']],
  ['Huile TCM', 'Aliment', ['medium-chain triglycerides', 'MCT oil']],
  ['Huile d\'algues', 'Aliment', ['algal oil', 'algae oil']],
  ['Mycoprotéine', 'Aliment', ['mycoprotein']],
  ['Insectes comestibles', 'Aliment', ['edible insects', 'insect protein', 'cricket powder']],
  ['Thé vert', 'Aliment', ['green tea']],
  ['Thé noir', 'Aliment', ['black tea']],

  // Habitudes manquantes
  ['Régime pauvre en purines', 'Habitude', ['low-purine diet', 'dietary purine', 'purine-rich foods']],
  ['Régime pauvre en oxalates', 'Habitude', ['low-oxalate diet', 'dietary oxalate']],
  ['Régime pauvre en histamine', 'Habitude', ['low-histamine diet', 'histamine intolerance']],
  ['Régime carnivore', 'Habitude', ['carnivore diet']],
  ['Crudivorisme', 'Habitude', ['raw food diet', 'raw vegan diet']],
];

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
    const base = `(${sujet}) AND (SRC:MED)`;
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
