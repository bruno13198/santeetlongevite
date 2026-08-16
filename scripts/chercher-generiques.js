// Recherche toutes les entrées contenant certains mots-clés,
// pour vérifier si une version "générique" existe déjà en base.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RECHERCHES = ['pomme', 'melon', 'pomelo'];

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

  RECHERCHES.forEach((motCle) => {
    const resultats = aliments.filter((a) =>
      a.nom.toLowerCase().includes(motCle)
    );

    console.log(`\n=== "${motCle}" (${resultats.length} résultats) ===`);
    resultats.forEach((a) => {
      const marque = idsAvecEtudes.has(a.id) ? ' [A DES ÉTUDES]' : '';
      console.log(`  - ${a.nom}${marque}`);
    });
  });
}

main();
