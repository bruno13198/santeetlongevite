// Supprime les aliments trop transformés détectés par mots-clés.
// Sécurité : ignore systématiquement tout aliment ayant déjà des études associées.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MOTS_CLES_EXCLUSION = [
  'biscuit', 'bonbon', 'chips', 'barre chocolat', 'barre céréalière',
  'confiserie', 'confiture', 'gelée', 'marmelade', 'chewing-gum',
  'chocolat', 'praline', 'nougat', 'caramel', 'guimauve', 'marshmallow',
  'gaufrette', 'meringue', 'macaron', 'spéculoos', 'sablé',
  'viennoiserie', 'croissant', 'pain au chocolat', 'pain aux raisins',
  'chausson', 'chouquette', 'brioche',
  'gâteau', 'tarte', 'éclair', 'mille-feuille', 'canelé', 'far breton',
  'baba au rhum', 'bûche', 'fraisier', 'entremets', 'pâtisserie',
  'glace', 'sorbet', 'crème glacée', 'esquimau', 'nougat glacé',
  'bière', 'vin blanc', 'vin rosé', 'vin doux', 'cidre', 'champagne',
  'rhum', 'vodka', 'whisky', ' gin', 'pastis', 'liqueur', 'alcool',
  'marsala',
  'limonade', 'soda', 'sirop', 'nectar',
  'saucisson', 'pâté', 'rillettes', 'mortadelle', 'salami', 'chorizo',
  'cervelas', 'andouille', 'galantine', 'bresaola', 'coppa',
  'bouillon', 'fond de veau', 'fond de volaille', 'court-bouillon',
  'sauce ', 'chapelure', 'gnocchi', 'nouilles instantanées',
  'poudre à lever', 'levure', 'bicarbonate', 'édulcorant',
  'crêpe dentelle', 'gressin', 'cracker apéritif', 'pop-corn',
];

const EXCEPTIONS = [
  'gingembre',
  'gelée royale',
  'vin rouge',
  'cola',
  'viennoiserie',
];

async function main() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom, slug');

  if (error) {
    console.log('Erreur récupération aliments:', error.message);
    return;
  }

  const { data: liaisons, error: erreurLiaisons } = await supabase
    .from('aliments_etudes')
    .select('aliment_id');

  if (erreurLiaisons) {
    console.log('Erreur récupération liaisons:', erreurLiaisons.message);
    return;
  }

  const idsAvecEtudes = new Set(liaisons.map((l) => l.aliment_id));

  const suspects = aliments.filter((a) => {
    if (idsAvecEtudes.has(a.id)) return false;

    const nomMinuscule = a.nom.toLowerCase();

    const estException = EXCEPTIONS.some((mot) => nomMinuscule.includes(mot));
    if (estException) return false;

    return MOTS_CLES_EXCLUSION.some((mot) => nomMinuscule.includes(mot));
  });

  console.log(`${suspects.length} aliments à supprimer :\n`);
  suspects.forEach((a) => console.log(`- ${a.nom}`));

  console.log('\nSuppression en cours...');

  const idsASupprimer = suspects.map((a) => a.id);

  const { error: erreurCandidats } = await supabase
    .from('candidats_rejetes')
    .delete()
    .in('aliment_id', idsASupprimer);

  if (erreurCandidats) {
    console.log('Erreur suppression candidats_rejetes:', erreurCandidats.message);
    return;
  }

  const { error: erreurSuppression } = await supabase
    .from('aliments')
    .delete()
    .in('id', idsASupprimer);

  if (erreurSuppression) {
    console.log('Erreur suppression:', erreurSuppression.message);
    return;
  }

  console.log(`\n${suspects.length} aliments supprimés avec succès.`);
}

main();
