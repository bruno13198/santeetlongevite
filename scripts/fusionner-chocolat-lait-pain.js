// Renomme une variété en version générique et supprime les autres,
// pour chocolat noir, lait entier et pain blanc.
// Les fiches gardées ont déjà des études associées (aucune perte de contenu).
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Nom exact à renommer -> nouveau nom générique
const RENOMMAGES = [
  { ancien: 'Chocolat noir 70 % de cacao environ, de dégustation, tablette', nouveau: 'Chocolat noir, tablette' },
  { ancien: 'Lait entier, cru', nouveau: 'Lait entier' },
  { ancien: 'Pain blanc (par ex. : baguette, boule…)', nouveau: 'Pain blanc' },
];

// Noms exacts à supprimer
const A_SUPPRIMER = [
  'Chocolat noir 50 % de cacao environ, tablette',
  'Chocolat noir 40% de cacao et plus, à pâtisser, tablette',
  'Chocolat, tablette (aliment moyen)',
  'Lait entier (aliment moyen)',
  'Pain blanc, sans sel ajouté',
  'Pain de tradition française (par ex. : baguette, boule…)',
];

async function main() {
  // Renommages
  for (const { ancien, nouveau } of RENOMMAGES) {
    const { data: aliment, error: erreurRecherche } = await supabase
      .from('aliments')
      .select('id, nom')
      .eq('nom', ancien)
      .maybeSingle();

    if (erreurRecherche || !aliment) {
      console.log(`Introuvable, on passe : "${ancien}"`);
      continue;
    }

    const { error: erreurUpdate } = await supabase
      .from('aliments')
      .update({ nom: nouveau })
      .eq('id', aliment.id);

    if (erreurUpdate) {
      console.log(`Erreur renommage "${ancien}":`, erreurUpdate.message);
    } else {
      console.log(`Renommé : "${ancien}" -> "${nouveau}"`);
    }
  }

  // Suppressions
  const { data: alimentsASupprimer, error: erreurRecherche } = await supabase
    .from('aliments')
    .select('id, nom')
    .in('nom', A_SUPPRIMER);

  if (erreurRecherche) {
    console.log('Erreur récupération à supprimer:', erreurRecherche.message);
    return;
  }

  console.log(`\n${alimentsASupprimer.length} aliments trouvés à supprimer :`);
  alimentsASupprimer.forEach((a) => console.log(`  - ${a.nom}`));

  const ids = alimentsASupprimer.map((a) => a.id);

  await supabase.from('candidats_rejetes').delete().in('aliment_id', ids);

  const { error: erreurSuppression } = await supabase
    .from('aliments')
    .delete()
    .in('id', ids);

  if (erreurSuppression) {
    console.log('Erreur suppression:', erreurSuppression.message);
    return;
  }

  console.log(`\n${alimentsASupprimer.length} aliments supprimés.`);
  console.log('Terminé.');
}

main();
