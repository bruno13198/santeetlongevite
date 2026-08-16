// Liste les aliments qui n'ont aucune étude associée en base.
// Ne supprime rien, affiche juste la liste dans les logs.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  const sansEtudes = aliments.filter((a) => !idsAvecEtudes.has(a.id));

  console.log(`${aliments.length} aliments au total.`);
  console.log(`${sansEtudes.length} aliments SANS aucune étude :\n`);

  sansEtudes.forEach((a) => {
    console.log(`- ${a.nom} (${a.slug})`);
  });
}

main();
