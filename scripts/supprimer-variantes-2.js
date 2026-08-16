// Supprime d'autres variétés spécifiques (crevette, prune, thon),
// en gardant la fiche générique. Sécurité : ignore tout aliment
// ayant déjà des études associées.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const A_SUPPRIMER = [
  // Crevette
  'Crevette blanche ou crevette tropicale (rose), élevage, cuite',
  'Crevette bouquet, sauvage, cuite',
  'Crevette grise, cuite',
  'Crevette sauvage, cuite',
  'Crevette tropicale (rose), cuite (Penaeus brasiliensis)',
  'Crevette tropicale (tigrée), élevage, cuite',
  // Prune
  'Prune mirabelle, sans noyau, crue',
  'Prune Reine-Claude, sans noyau, crue',
  'Prune violette, sans noyau, crue',
  // Thon
  'Thon albacore, cru',
  'Thon germon ou thon blanc, cru',
  'Thon listao ou bonite à ventre rayé, cru',
  'Thon rouge, cru',
];

async function main() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom')
    .in('nom', A_SUPPRIMER);

  if (error) {
    console.log('Erreur récupération:', error.message);
    return;
  }

  const { data: liaisons } = await supabase
    .from('aliments_etudes')
    .select('aliment_id');

  const idsAvecEtudes = new Set((liaisons || []).map((l) => l.aliment_id));

  const alimentsSurs = aliments.filter((a) => !idsAvecEtudes.has(a.id));

  console.log(`${aliments.length} aliments trouvés, ${alimentsSurs.length} sûrs à supprimer (sans études) :`);
  alimentsSurs.forEach((a) => console.log(`  - ${a.nom}`));

  const ids = alimentsSurs.map((a) => a.id);

  await supabase.from('candidats_rejetes').delete().in('aliment_id', ids);

  const { error: erreurSuppression } = await supabase
    .from('aliments')
    .delete()
    .in('id', ids);

  if (erreurSuppression) {
    console.log('Erreur suppression:', erreurSuppression.message);
    return;
  }

  console.log(`\n${alimentsSurs.length} aliments supprimés.`);
  console.log('Terminé.');
}

main();
