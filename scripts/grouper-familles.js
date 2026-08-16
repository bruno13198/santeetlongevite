// Regroupe les aliments par famille probable (premier mot du nom),
// pour repérer les groupes de variantes à trier manuellement.
// N'affiche que les groupes de 2 aliments ou plus.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Noms composés à traiter comme leur propre famille, distincte du premier mot seul
const FAMILLES_COMPOSEES = [
  'pomme de terre',
  'chou de bruxelles',
  'noix de coco',
  'noix de cajou',
  'noix de macadamia',
  'noix de saint-jacques',
  'huile de palme',
  'beurre de cacahuète',
];

function premierMot(nom) {
  const nomNormalise = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const composeTrouve = FAMILLES_COMPOSEES.find((c) => nomNormalise.startsWith(c));
  if (composeTrouve) return composeTrouve;

  return nomNormalise.split(/[,\s]/)[0];
}

async function main() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom, slug');

  if (error) {
    console.log('Erreur récupération aliments:', error.message);
    return;
  }

  const { data: liaisons } = await supabase
    .from('aliments_etudes')
    .select('aliment_id');

  const idsAvecEtudes = new Set((liaisons || []).map((l) => l.aliment_id));

  const groupes = {};
  aliments.forEach((a) => {
    const cle = premierMot(a.nom);
    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push(a);
  });

  const groupesMultiples = Object.entries(groupes)
    .filter(([, membres]) => membres.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`${groupesMultiples.length} familles avec plusieurs variantes :\n`);

  groupesMultiples.forEach(([cle, membres]) => {
    console.log(`=== ${cle.toUpperCase()} (${membres.length}) ===`);
    membres.forEach((m) => {
      const marque = idsAvecEtudes.has(m.id) ? ' [A DES ÉTUDES]' : '';
      console.log(`  - ${m.nom}${marque}`);
    });
    console.log('');
  });
}

main();
