// Script de sauvegarde : exporte toutes les tables Supabase en fichiers JSON
// dans le dossier backups/, avec la date du jour dans le nom de fichier.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLES = ['aliments', 'etudes', 'aliments_etudes', 'candidats_rejetes'];

async function exporterTable(nomTable) {
  const toutesLesLignes = [];
  let debut = 0;
  const taillePage = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(nomTable)
      .select('*')
      .range(debut, debut + taillePage - 1);

    if (error) {
      console.log(`Erreur export ${nomTable}:`, error.message);
      break;
    }

    toutesLesLignes.push(...data);

    if (data.length < taillePage) break;
    debut += taillePage;
  }

  return toutesLesLignes;
}

async function main() {
  const dateDuJour = new Date().toISOString().slice(0, 10);
  const dossierBackup = path.join('backups', dateDuJour);

  fs.mkdirSync(dossierBackup, { recursive: true });

  for (const table of TABLES) {
    console.log(`Export de ${table}...`);
    const lignes = await exporterTable(table);
    const cheminFichier = path.join(dossierBackup, `${table}.json`);
    fs.writeFileSync(cheminFichier, JSON.stringify(lignes, null, 2));
    console.log(`  ${lignes.length} lignes enregistrées dans ${cheminFichier}`);
  }

  console.log('\nExport terminé.');
}

main();
