// Renomme une variété en version générique et supprime les autres,
// pour pomme, melon et pomelo. Aucun de ces aliments n'a d'études associées,
// vérifié au préalable — pas de perte de contenu.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Nom exact à renommer -> nouveau nom générique
const RENOMMAGES = [
  { ancien: 'Pomme Golden, chair et peau, crue', nouveau: 'Pomme, crue' },
  { ancien: 'Melon cantaloup (par ex.: Charentais), chair sans peau, sans pépins, cru', nouveau: 'Melon, cru' },
];

// Noms exacts à supprimer
const A_SUPPRIMER = [
  'Pomme Canada, chair sans peau, crue',
  'Pomme Chantecler, chair sans peau, crue',
  'Pomme Gala, chair sans peau, crue',
  'Pomme Granny Smith, chair et peau, crue',
  'Pomme Pink lady, chair sans peau, crue',
  'Melon, chair sans peau, sans pépins, cru, prélevé à la Martinique',
  'Melon miel ou melon honeydew, chair sans peau, sans pépins, cru',
  'Pomelo (dit Pamplemousse) jaune, chair sans peau, sans pépins, cru',
  'Pomelo (dit Pamplemousse) rose, chair sans peau, sans pépins, cru',
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
