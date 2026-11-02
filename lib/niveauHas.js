// 2 nov. 2026 : équivalent approximatif du niveau de preuve dans la grille de la HAS
// (niveaux 1 à 4), déduit du type d'étude classé selon l'échelle d'Oxford.
// Utilisé par les fiches (ListeEtudes.js) et par l'export Excel (api/export).
// La HAS distingue les essais « de forte » et « de faible puissance » sans seuil chiffré :
// faute de calcul de puissance dans le résumé, un essai (ou une synthèse d'essais)
// sans défaut relevé est rangé au niveau 1, et un essai abaissé au niveau 2.
// Les revues narratives et mécanistiques n'ont pas d'équivalent HAS (null).

const SYNTHESES_ESSAIS = [
  "Méta-analyse d'essais randomisés",
  "Revue systématique d'essais randomisés",
  "Revue parapluie d'essais randomisés",
];
const ESSAIS_RANDOMISES = ['Essai randomisé contrôlé', 'Essai croisé randomisé'];
const NIVEAU_2 = [
  'Essai non randomisé',
  'Étude de cohorte prospective',
  'Étude de cohorte rétrospective',
  'Randomisation mendélienne',
  "Méta-analyse d'études observationnelles",
  "Revue systématique d'études observationnelles",
  "Revue parapluie d'études observationnelles",
];
const NIVEAU_3 = ['Étude cas-témoins'];
const NIVEAU_4 = ['Étude transversale', 'Étude pilote sans groupe témoin', 'Série de cas', 'Cas clinique'];

export function niveauHas(designEtude, ajustementPreuve) {
  if (!designEtude) return null;
  const abaisse = String(ajustementPreuve || '').startsWith('Abaissé');
  if (SYNTHESES_ESSAIS.includes(designEtude) || ESSAIS_RANDOMISES.includes(designEtude)) {
    return abaisse ? 2 : 1;
  }
  if (NIVEAU_2.includes(designEtude)) return 2;
  if (NIVEAU_3.includes(designEtude)) return 3;
  if (NIVEAU_4.includes(designEtude)) return 4;
  return null; // revue narrative, revue mécanistique, autre
}
