// Script ponctuel : vérifie qu'une liste de termes candidats correspond bien
// à des descripteurs MeSH actifs sur Europe PMC, avant de les intégrer
// définitivement à la base habitudes_sportives (future table).
// N'écrit rien en base, juste un rapport dans les logs.

const TERMES_CANDIDATS = [
  // Termes généraux/chapeaux
  'Sports',
  'Exercise',
  'Exercise Therapy',
  'Motor Activity',
  'Physical Fitness',
  // Endurance / cardio
  'Running',
  'Bicycling',
  'Swimming',
  'Walking',
  'High-Intensity Interval Training',
  // Force / résistance
  'Resistance Training',
  'Weight Lifting',
  'Plyometric Exercise',
  // Corps-esprit
  'Yoga',
  'Tai Ji',
  // Sports collectifs
  'Baseball',
  'Basketball',
  'Football',
  'Soccer',
  'Volleyball',
  'Hockey',
  // Sports individuels / combat
  'Boxing',
  'Martial Arts',
  'Golf',
  'Gymnastics',
  'Track and Field',
  'Wrestling',
  'Skiing',
  'Skating',
  'Mountaineering',
  // Autres
  'Dancing',
  'Recreation',
  'Water Sports',
];

async function verifierTerme(terme) {
  const requete = `MESH:"${terme}" AND SRC:MED`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`${terme.padEnd(35)} → ERREUR HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const total = data.hitCount ?? 0;
    const statut = total > 0 ? 'OK' : 'AUCUN RÉSULTAT — probablement pas un descripteur MeSH valide';
    console.log(`${terme.padEnd(35)} → ${String(total).padStart(6)} résultats  [${statut}]`);
  } catch (e) {
    console.log(`${terme.padEnd(35)} → ERREUR : ${e.message}`);
  }
}

async function main() {
  console.log(`Vérification de ${TERMES_CANDIDATS.length} termes MeSH candidats pour le sport...\n`);
  for (const terme of TERMES_CANDIDATS) {
    await verifierTerme(terme);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log('\nTerminé.');
}

main();
