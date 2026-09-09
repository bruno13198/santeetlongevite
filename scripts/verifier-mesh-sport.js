// Script ponctuel : vérifie qu'une liste de sujets candidats (croisements
// terme MeSH + mot-clé de précision) renvoie un vrai volume de résultats
// sur Europe PMC, avant de les intégrer définitivement à une future table
// pour le sport. N'écrit rien en base, juste un rapport dans les logs.

const SUJETS_CANDIDATS = [
  // Endurance / intensité
  { nom: 'Running + zone 2', mesh: 'Running', motCle: 'zone 2' },
  { nom: 'Running + VO2max', mesh: 'Running', motCle: 'VO2max' },
  { nom: 'Exercise + VO2max', mesh: 'Exercise', motCle: 'VO2max' },
  { nom: 'Exercise + mitochondrial biogenesis', mesh: 'Exercise', motCle: 'mitochondrial biogenesis' },
  { nom: 'HIIT + VO2max', mesh: 'High-Intensity Interval Training', motCle: 'VO2max' },
  { nom: 'Exercise + low intensity', mesh: 'Exercise', motCle: 'low intensity' },
  { nom: 'Exercise + moderate intensity', mesh: 'Exercise', motCle: 'moderate intensity' },
  { nom: 'Exercise + high intensity', mesh: 'Exercise', motCle: 'high intensity' },

  // Force / composition corporelle
  { nom: 'Resistance Training + sarcopenia', mesh: 'Resistance Training', motCle: 'sarcopenia' },
  { nom: 'Resistance Training + bone density', mesh: 'Resistance Training', motCle: 'bone density' },
  { nom: 'Resistance Training + hypertrophy', mesh: 'Resistance Training', motCle: 'hypertrophy' },
  { nom: 'Resistance Training + muscle strength', mesh: 'Resistance Training', motCle: 'muscle strength' },
  { nom: 'Resistance Training + muscle mass', mesh: 'Resistance Training', motCle: 'muscle mass' },
  { nom: 'Resistance Training + insulin sensitivity', mesh: 'Resistance Training', motCle: 'insulin sensitivity' },
  { nom: 'Resistance Training + metabolic rate', mesh: 'Resistance Training', motCle: 'metabolic rate' },

  // Métabolisme
  { nom: 'Exercise + metabolism', mesh: 'Exercise', motCle: 'metabolism' },
  { nom: 'Exercise + fat oxidation', mesh: 'Exercise', motCle: 'fat oxidation' },

  // Mobilité / vieillissement
  { nom: 'Exercise + mobility', mesh: 'Exercise', motCle: 'mobility' },
  { nom: 'Exercise + aging', mesh: 'Exercise', motCle: 'aging' },
  { nom: 'Walking + fall prevention', mesh: 'Walking', motCle: 'fall prevention' },

  // Maladies / mortalité
  { nom: 'Exercise + mortality', mesh: 'Exercise', motCle: 'mortality' },
  { nom: 'Exercise + cardiovascular disease', mesh: 'Exercise', motCle: 'cardiovascular disease' },
  { nom: 'Exercise + cancer', mesh: 'Exercise', motCle: 'cancer' },
  { nom: 'Exercise + diabetes', mesh: 'Exercise', motCle: 'diabetes' },
  { nom: 'Exercise + immune function', mesh: 'Exercise', motCle: 'immune function' },

  // Cognition / santé mentale
  { nom: 'Exercise + cognitive function', mesh: 'Exercise', motCle: 'cognitive function' },
  { nom: 'Exercise + depression', mesh: 'Exercise', motCle: 'depression' },
  { nom: 'Exercise + anxiety', mesh: 'Exercise', motCle: 'anxiety' },
  { nom: 'Exercise + BDNF', mesh: 'Exercise', motCle: 'brain-derived neurotrophic factor' },

  // Longévité / récupération
  { nom: 'Exercise + longevity', mesh: 'Exercise', motCle: 'longevity' },
  { nom: 'Exercise + telomere', mesh: 'Exercise', motCle: 'telomere' },
  { nom: 'Exercise + inflammation', mesh: 'Exercise', motCle: 'inflammation' },
  { nom: 'Exercise + muscle recovery', mesh: 'Exercise', motCle: 'muscle recovery' },

  // Populations spécifiques
  { nom: 'Exercise + pregnancy', mesh: 'Exercise', motCle: 'pregnancy' },
  { nom: 'Exercise + menopause', mesh: 'Exercise', motCle: 'menopause' },

  // Sommeil / microbiote / sédentarité
  { nom: 'Sleep + athletic performance', mesh: 'Sleep', motCle: 'athletic performance' },
  { nom: 'Exercise + gut microbiome', mesh: 'Exercise', motCle: 'gut microbiome' },
  { nom: 'Sedentary Behavior (seul)', mesh: 'Sedentary Behavior', motCle: null },

  // Corps-esprit
  { nom: 'Yoga + stress', mesh: 'Yoga', motCle: 'stress' },
  { nom: 'Yoga + chronic pain', mesh: 'Yoga', motCle: 'chronic pain' },
];

async function verifierSujet(sujet) {
  const requete = sujet.motCle
    ? `MESH:"${sujet.mesh}" AND (TITLE:"${sujet.motCle}" OR ABSTRACT:"${sujet.motCle}") AND SRC:MED`
    : `MESH:"${sujet.mesh}" AND SRC:MED`;

  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`${sujet.nom.padEnd(40)} → ERREUR HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const total = data.hitCount ?? 0;
    const statut = total >= 20 ? 'OK — bon volume' : total > 0 ? 'FAIBLE volume' : 'AUCUN RÉSULTAT';
    console.log(`${sujet.nom.padEnd(40)} → ${String(total).padStart(6)} résultats  [${statut}]`);
  } catch (e) {
    console.log(`${sujet.nom.padEnd(40)} → ERREUR : ${e.message}`);
  }
}

async function main() {
  console.log(`Vérification de ${SUJETS_CANDIDATS.length} sujets candidats pour le sport...\n`);
  for (const sujet of SUJETS_CANDIDATS) {
    await verifierSujet(sujet);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log('\nTerminé.');
}

main();
