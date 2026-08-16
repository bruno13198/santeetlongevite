// Supprime les variétés spécifiques de fruits, en gardant la fiche générique.
// Sécurité : ignore tout aliment ayant déjà des études associées.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const A_SUPPRIMER = [
  // Tomate
  'Tomate, séchée',
  'Tomate allongée, crue',
  'Tomate cerise, crue',
  'Tomate côtelée ou coeur de boeuf, crue',
  'Tomate grappe, crue',
  'Tomate marmande, crue',
  'Tomate noire de Crimée, crue',
  'Tomate ronde, crue',
  'Tomate verte, crue',
  // Raisin
  'Raisin Chasselas, cru',
  'Raisin noir Muscat, cru',
  'Raisin sec',
  // Mangue
  'Mangue José, chair sans peau, sans noyau, crue, prélevée à La Réunion (Mangifera indica L.)',
  'Mangue julie, chair sans peau, sans noyau, crue, prélevée à la Martinique',
  'Mangue moussache, chair sans peau, sans noyau, crue, prélevé à la Martinique',
  'Mangue verte, chair sans peau, sans noyau, crue, prélevée à la Martinique',
  // Pêche
  'Pêche blanche, chair et peau, sans noyau, crue',
  'Pêche jaune, chair sans peau, sans noyau, crue',
  // Orange
  'Orange (variété locale), chair sans peau, sans pépins, prélevée à la Martinique',
  'Orange amère, chair sans peau, sans pépins, crue, prélevée à la Martinique',
  // Papaye
  'Papaye Colombo (fruit mûr), chair sans peau, sans pépins, crue, prélevée à La Réunion (Carica papaya L.)',
  'Papaye verte, chair sans peau, crue, prélevée à la Martinique',
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
