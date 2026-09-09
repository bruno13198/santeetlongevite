// Script ponctuel : vérifie le volume RÉEL (avec le vrai filtre qualité PUB_TYPE,
// identique à import-etudes.js / import-habitudes.js) pour les 33 sports individuels
// et les 35 croisements sport + modificateur, avant de construire les tables finales.
// N'écrit rien en base.

const FILTRE_PUB_TYPE = '(PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial")';

const SPORTS = [
  'Sports', 'Exercise', 'Exercise Therapy', 'Motor Activity', 'Physical Fitness',
  'Running', 'Bicycling', 'Swimming', 'Walking', 'High-Intensity Interval Training',
  'Resistance Training', 'Weight Lifting', 'Plyometric Exercise', 'Yoga', 'Tai Ji',
  'Baseball', 'Basketball', 'Football', 'Soccer', 'Volleyball', 'Hockey',
  'Boxing', 'Martial Arts', 'Golf', 'Gymnastics', 'Track and Field', 'Wrestling',
  'Skiing', 'Skating', 'Mountaineering', 'Dancing', 'Recreation', 'Water Sports',
];

const HABITUDES = [
  { nom: 'Running + zone 2', mesh: 'Running', motCle: 'zone 2' },
  { nom: 'Running + VO2max', mesh: 'Running', motCle: 'VO2max' },
  { nom: 'Exercise + VO2max', mesh: 'Exercise', motCle: 'VO2max' },
  { nom: 'Exercise + mitochondrial biogenesis', mesh: 'Exercise', motCle: 'mitochondrial biogenesis' },
  { nom: 'HIIT + VO2max', mesh: 'High-Intensity Interval Training', motCle: 'VO2max' },
  { nom: 'Exercise + low intensity', mesh: 'Exercise', motCle: 'low intensity' },
  { nom: 'Exercise + moderate intensity', mesh: 'Exercise', motCle: 'moderate intensity' },
  { nom: 'Exercise + high intensity', mesh: 'Exercise', motCle: 'high intensity' },
  { nom: 'Resistance Training + sarcopenia', mesh: 'Resistance Training', motCle: 'sarcopenia' },
  { nom: 'Resistance Training + bone density', mesh: 'Resistance Training', motCle: 'bone density' },
  { nom: 'Resistance Training + hypertrophy', mesh: 'Resistance Training', motCle: 'hypertrophy' },
  { nom: 'Resistance Training + muscle strength', mesh: 'Resistance Training', motCle: 'muscle strength' },
  { nom: 'Resistance Training + muscle mass', mesh: 'Resistance Training', motCle: 'muscle mass' },
  { nom: 'Resistance Training + insulin sensitivity', mesh: 'Resistance Training', motCle: 'insulin sensitivity' },
  { nom: 'Resistance Training + metabolic rate', mesh: 'Resistance Training', motCle: 'metabolic rate' },
  { nom: 'Exercise + metabolism', mesh: 'Exercise', motCle: 'metabolism' },
  { nom: 'Exercise + fat oxidation', mesh: 'Exercise', motCle: 'fat oxidation' },
  { nom: 'Exercise + mobility', mesh: 'Exercise', motCle: 'mobility' },
  { nom: 'Exercise + aging', mesh: 'Exercise', motCle: 'aging' },
  { nom: 'Walking + fall prevention', mesh: 'Walking', motCle: 'fall prevention' },
  { nom: 'Exercise + mortality', mesh: 'Exercise', motCle: 'mortality' },
  { nom: 'Exercise + cardiovascular disease', mesh: 'Exercise', motCle: 'cardiovascular disease' },
  { nom: 'Exercise + cancer', mesh: 'Exercise', motCle: 'cancer' },
  { nom: 'Exercise + diabetes', mesh: 'Exercise', motCle: 'diabetes' },
  { nom: 'Exercise + immune function', mesh: 'Exercise', motCle: 'immune function' },
  { nom: 'Exercise + cognitive function', mesh: 'Exercise', motCle: 'cognitive function' },
  { nom: 'Exercise + depression', mesh: 'Exercise', motCle: 'depression' },
  { nom: 'Exercise + anxiety', mesh: 'Exercise', motCle: 'anxiety' },
  { nom: 'Exercise + BDNF', mesh: 'Exercise', motCle: 'brain-derived neurotrophic factor' },
  { nom: 'Exercise + longevity', mesh: 'Exercise', motCle: 'longevity' },
  { nom: 'Exercise + telomere', mesh: 'Exercise', motCle: 'telomere' },
  { nom: 'Exercise + inflammation', mesh: 'Exercise', motCle: 'inflammation' },
  { nom: 'Exercise + muscle recovery', mesh: 'Exercise', motCle: 'muscle recovery' },
  { nom: 'Exercise + pregnancy', mesh: 'Exercise', motCle: 'pregnancy' },
  { nom: 'Exercise + menopause', mesh: 'Exercise', motCle: 'menopause' },
  { nom: 'Sleep + athletic performance', mesh: 'Sleep', motCle: 'athletic performance' },
  { nom: 'Exercise + gut microbiome', mesh: 'Exercise', motCle: 'gut microbiome' },
  { nom: 'Sedentary Behavior (seul)', mesh: 'Sedentary Behavior', motCle: null },
  { nom: 'Yoga + stress', mesh: 'Yoga', motCle: 'stress' },
  { nom: 'Yoga + chronic pain', mesh: 'Yoga', motCle: 'chronic pain' },
];

async function verifier(nomAffiche, mesh, motCle) {
  const base = `MESH:"${mesh}"`;
  const avecMotCle = motCle ? `${base} AND (TITLE:"${motCle}" OR ABSTRACT:"${motCle}")` : base;
  const requete = `${avecMotCle} AND SRC:MED AND ${FILTRE_PUB_TYPE}`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`${nomAffiche.padEnd(42)} → ERREUR HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const total = data.hitCount ?? 0;
    const statut = total >= 20 ? 'OK — bon volume' : total > 0 ? 'FAIBLE volume' : 'AUCUN RÉSULTAT';
    console.log(`${nomAffiche.padEnd(42)} → ${String(total).padStart(6)} résultats  [${statut}]`);
  } catch (e) {
    console.log(`${nomAffiche.padEnd(42)} → ERREUR : ${e.message}`);
  }
}

async function main() {
  console.log(`=== SPORTS (${SPORTS.length}) avec filtre qualité réel ===\n`);
  for (const sport of SPORTS) {
    await verifier(sport, sport, null);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(`\n=== HABITUDES SPORTIVES (${HABITUDES.length}) avec filtre qualité réel ===\n`);
  for (const h of HABITUDES) {
    await verifier(h.nom, h.mesh, h.motCle);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log('\nTerminé.');
}

main();
