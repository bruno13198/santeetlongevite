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
  // Concepts généraux
  ['Aliments ultra-transformés', 'Concept', ['ultra-processed food', 'ultra-processed foods', 'ultraprocessed food', 'ultraprocessed foods']],
  ['Viandes transformées', 'Concept', ['processed meat', 'processed meats']],
  ['Restauration rapide', 'Concept', ['fast food', 'fast-food']],
  ['Aliments frits', 'Concept', ['fried food', 'fried foods', 'deep-fried food']],
  ['Alcool (consommation)', 'Concept', ['alcohol consumption', 'alcohol intake']],
  ['Plats préparés', 'Concept', ['ready meals', 'ready-to-eat meals', 'convenience food', 'convenience foods']],
  ['Snacks salés', 'Concept', ['salty snacks', 'snack foods']],
  ['Substituts de viande végétaux', 'Concept', ['plant-based meat', 'meat substitutes', 'meat analogues', 'meat alternatives', 'meat analogs', 'plant-based burger', 'veggie burger', 'vegetarian burger', 'Beyond Burger', 'Impossible Burger']],
  ['Boissons végétales', 'Concept', ['plant-based milk', 'soy milk', 'oat milk', 'almond milk', 'plant-based beverages']],
  ['Édulcorants (général)', 'Concept', ['artificial sweeteners', 'non-nutritive sweeteners', 'low-calorie sweeteners']],

  // Plats et restauration rapide
  ['Pizza', 'Plat', ['pizza']],
  ['Hamburger', 'Plat', ['hamburger', 'hamburgers', 'burger', 'burgers', 'cheeseburger', 'beef burger']],
  ['Hot-dog', 'Plat', ['hot dog', 'hot dogs']],
  ['Frites', 'Plat', ['French fries', 'french fried potatoes']],
  ['Poulet frit', 'Plat', ['fried chicken']],
  ['Nuggets', 'Plat', ['chicken nuggets']],
  ['Nouilles instantanées', 'Plat', ['instant noodles', 'instant noodle']],
  ['Sushi', 'Plat', ['sushi']],
  ['Soupes', 'Plat', ['soup consumption', 'vegetable soup']],

  // Charcuterie
  ['Saucisson, salami', 'Charcuterie', ['salami']],
  ['Charcuterie (général)', 'Charcuterie', ['cured meat', 'cured meats', 'charcuterie']],

  // Produits sucrés
  ['Céréales du petit-déjeuner', 'Produit sucré', ['breakfast cereal', 'breakfast cereals', 'ready-to-eat cereal']],
  ['Biscuits et gâteaux', 'Produit sucré', ['biscuits', 'sweet bakery products', 'cakes and biscuits']],
  ['Viennoiseries et pâtisseries', 'Produit sucré', ['pastries', 'pastry consumption', 'croissant']],
  ['Confiseries', 'Produit sucré', ['confectionery', 'candy consumption', 'sweets consumption']],
  ['Glaces', 'Produit sucré', ['ice cream']],
  ['Chocolat au lait', 'Produit sucré', ['milk chocolate']],
  ['Pâte à tartiner', 'Produit sucré', ['chocolate spread', 'hazelnut spread']],
  ['Barres céréalières ou protéinées', 'Produit sucré', ['cereal bar', 'cereal bars', 'granola bar', 'protein bar', 'protein bars']],
  ['Yaourts sucrés ou aromatisés', 'Produit sucré', ['flavored yogurt', 'flavoured yogurt', 'sweetened yogurt']],
  ['Lait chocolaté', 'Produit sucré', ['chocolate milk']],
  ['Popcorn', 'Produit salé', ['popcorn']],
  ['Chips', 'Produit salé', ['potato chips', 'potato crisps']],

  // Boissons
  ['Sodas light', 'Boisson', ['diet soda', 'diet sodas', 'artificially sweetened beverages', 'diet beverages']],
  ['Boissons énergisantes', 'Boisson', ['energy drinks', 'energy drink']],
  ['Bière', 'Boisson', ['beer', 'beer consumption']],
  ['Spiritueux', 'Boisson', ['spirits consumption', 'distilled spirits', 'liquor consumption']],
  ['Jus de fruits (général)', 'Boisson', ['fruit juice', 'fruit juices', '100% fruit juice']],
  ['Eau du robinet', 'Boisson', ['tap water', 'drinking water']],
  ['Eau de source', 'Boisson', ['spring water']],

  // Édulcorants précis
  ['Aspartame', 'Additif', ['aspartame']],
  ['Sucralose', 'Additif', ['sucralose']],
  ['Stévia', 'Additif', ['stevia', 'steviol glycosides']],
  ['Érythritol', 'Additif', ['erythritol']],

  // Matières grasses et condiments
  ['Margarine', 'Matière grasse', ['margarine']],
  ['Mayonnaise', 'Condiment', ['mayonnaise']],
  ['Ketchup', 'Condiment', ['ketchup']],
  ['Sauce soja', 'Condiment', ['soy sauce']],
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
