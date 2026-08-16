// Détecte les aliments probablement trop transformés pour un site santé/longévité,
// à partir de mots-clés dans le nom. Ne supprime rien, affiche juste une liste à valider.

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
  'bière', 'vin ', 'cidre', 'champagne', 'rhum', 'vodka', 'whisky',
  'gin', 'pastis', 'liqueur', 'alcool', 'marsala', 'crème de cassis',
  'cola', 'limonade', 'soda', 'sirop', 'nectar',
  'saucisson', 'pâté', 'rillettes', 'mortadelle', 'salami', 'chorizo',
  'cervelas', 'andouille', 'galantine', 'bresaola', 'coppa',
  'bouillon', 'fond de veau', 'fond de volaille', 'court-bouillon',
  'sauce ', 'chapelure', 'gnocchi', 'nouilles instantanées',
  'poudre à lever', 'levure', 'bicarbonate', 'édulcorant',
  'crêpe dentelle', 'gressin', 'cracker apéritif', 'pop-corn',
];

async function main() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom, slug');

  if (error) {
    console.log('Erreur récupération aliments:', error.message);
    return;
  }

  const suspects = aliments.filter((a) => {
    const nomMinuscule = a.nom.toLowerCase();
    return MOTS_CLES_EXCLUSION.some((mot) => nomMinuscule.includes(mot));
  });

  console.log(`${aliments.length} aliments au total.`);
  console.log(`${suspects.length} aliments suspects (probablement trop transformés) :\n`);

  suspects.forEach((a) => {
    console.log(`- ${a.nom} (${a.slug})`);
  });
}

main();
