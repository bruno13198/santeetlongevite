// Sauvegarde complète de la base Supabase (version 2, 28 oct. 2026).
//
// Récupère automatiquement la liste de toutes les tables auprès de Supabase (aucune table oubliée,
// y compris les futures), exporte chacune en JSON dans le dossier sauvegarde/, et écrit un fichier
// _bilan.json (date, nombre de lignes par table, erreurs). Le workflow chiffre ensuite ce dossier
// dans une archive 7z protégée par mot de passe : le dépôt étant public, rien n'est stocké en clair.
//
// En cas d'erreur sur une table, le script termine en échec pour que GitHub prévienne par e-mail.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const URL_SUPABASE = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(URL_SUPABASE, CLE);

const DOSSIER = 'sauvegarde';
const TAILLE_PAGE = 1000;

// Liste des tables (et vues) exposées par Supabase, lue dans la description de l'API.
async function listerTables() {
  const res = await fetch(`${URL_SUPABASE}/rest/v1/`, {
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) throw new Error(`Liste des tables impossible (erreur ${res.status}).`);
  const description = await res.json();
  const tables = Object.keys(description.definitions || {}).sort();
  if (tables.length === 0) throw new Error('Aucune table trouvée dans la description de l\'API.');
  return tables;
}

// Lit une page ; trie par id quand la colonne existe, pour une pagination stable.
async function lirePage(nomTable, debut, trierParId) {
  let requete = supabase.from(nomTable).select('*');
  if (trierParId) requete = requete.order('id', { ascending: true });
  return requete.range(debut, debut + TAILLE_PAGE - 1);
}

async function exporterTable(nomTable) {
  const lignes = [];
  let trierParId = true;
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    let { data, error } = await lirePage(nomTable, debut, trierParId);
    if (error && trierParId && debut === 0) {
      // Pas de colonne id : on relit sans tri.
      trierParId = false;
      ({ data, error } = await lirePage(nomTable, debut, false));
    }
    if (error) throw new Error(error.message);
    lignes.push(...data);
    if (data.length < TAILLE_PAGE) break;
  }
  return lignes;
}

async function main() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const tables = await listerTables();
  console.log(`${tables.length} tables à sauvegarder : ${tables.join(', ')}\n`);

  const bilan = { date: new Date().toISOString(), tables: {}, erreurs: {} };
  for (const table of tables) {
    try {
      const lignes = await exporterTable(table);
      fs.writeFileSync(path.join(DOSSIER, `${table}.json`), JSON.stringify(lignes));
      bilan.tables[table] = lignes.length;
      console.log(`  ${table} : ${lignes.length} lignes`);
    } catch (e) {
      bilan.erreurs[table] = e.message;
      console.log(`  ! ${table} : ERREUR ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(DOSSIER, '_bilan.json'), JSON.stringify(bilan, null, 2));

  const nbErreurs = Object.keys(bilan.erreurs).length;
  console.log(`\nSauvegarde terminée : ${Object.keys(bilan.tables).length} tables, ${nbErreurs} erreur(s).`);
  if (nbErreurs > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
