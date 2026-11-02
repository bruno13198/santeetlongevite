// Liste partagée des mots de TITRE signalant un sujet animal, végétal, informatique ou matériau
// (extraite d'import-etudes.js pour être commune aux imports et au comptage).
// Un titre contenant l'un de ces mots est exclu de la recherche Europe PMC, SAUF s'il contient
// aussi un marqueur humain ("humans", "patients", "trial"...).
// Historique : "poultry" seul retiré le 28 sept. 2026 (bloquait "poultry consumption").
// Écartés volontairement : packaging, post-harvest, postharvest, aquaculture, drought,
// abiotic stress, wastewater, genome-wide, transcriptomic, sensor, spectroscopy,
// germination, biofilm, invasive, juvenile, nanoparticles, subtilis, lactiplantibacillus.

const MOTS_EXCLUS_TITRE = [
  // Animaux et élevage
  'mice', 'mouse', 'murine', 'rat', 'rats', 'rodent', 'rodents',
  'broiler', 'broilers', 'chickens', 'hens',
  'poultry farm', 'poultry farms', 'poultry production', 'poultry industry', 'poultry feed',
  'poultry diet', 'poultry diets', 'poultry litter', 'poultry house', 'poultry houses',
  'piglets', 'pigs', 'swine', 'porcine', 'cattle', 'dairy cows', 'calves', 'lambs', 'ruminants',
  'zebrafish', 'Drosophila', 'larvae', 'nematode', 'nematodes',
  'honeybee', 'honeybees', 'Apis mellifera', 'honey bee', 'silage',
  'breast meat', 'meat quality', 'retail chicken', 'nutrient digestibility', 'rumen fermentation',
  'soybean meal',
  // Aquaculture
  'seabream', 'aurata', 'Sparus', 'gilthead seabream', 'Pagrus major', 'vannamei', 'Penaeus',
  'Oncorhynchus', 'grass carp', 'common carp', 'Cyprinus carpio', 'Oreochromis niloticus',
  'Nile tilapia', 'white shrimp', 'Mytilus galloprovincialis',
  // Agronomie et génétique végétale
  'Arabidopsis', 'cultivar', 'cultivars', 'rootstock', 'pest', 'biocontrol', 'herbicide',
  'fertilizer', 'salt stress', 'seedlings', 'seedling', 'gene family', 'genome-wide identification',
  'genome-wide characterization', 'genome sequence', 'genomic characterization', 'new species',
  'rhizosphere', 'Fusarium', 'cultivation', 'soils', 'greenhouse', 'Botrytis', 'cinerea',
  'photosynthetic', 'hydroponic', 'endophytic', 'Alternaria', 'Trichoderma', 'mosaic',
  'flowering', 'growth-promoting', 'plant growth', 'fruit quality', 'drought tolerance',
  'drought stress', 'stress tolerance', 'salt tolerance', 'salinity stress', 'mosaic virus',
  'arbuscular mycorrhizal', 'anthocyanin biosynthesis', 'Brassica juncea', 'soft rot',
  'lettuce growth', 'use efficiency', 'growth promotion', 'Colocasia esculenta',
  // Matériaux, procédés et conservation
  'hydrogel', 'hydrogels', 'scaffold', 'scaffolds', 'tissue engineering', 'bioprinting',
  'microneedle', 'microneedles', 'wound dressing', 'edible film', 'shelf life', 'films',
  'composite films', 'packaging films', 'active packaging', 'adsorption', 'biochar',
  'green synthesis', 'silver nanoparticles', 'oxide nanoparticles', 'carbon quantum', 'quantum',
  'Pickering', 'rheological', 'interfacial', 'eutectic', 'deep eutectic', 'porous',
  'reinforced', 'composites', 'emulsion gels', 'gel properties', 'physicochemical properties',
  'physicochemical characterization', 'storage stability', 'oxidative stability', 'color stability',
  'freshness', 'freshness monitoring', 'spoilage', 'refrigerated', 'fresh-cut', 'pulsed',
  'strawberry preservation', 'fruit preservation', 'food preservation', 'quality deterioration',
  'microbiological quality', 'flavor compounds', 'pomelo peel', 'vitro digestion',
  'solid-state fermentation', 'response surface', 'metabolic engineering', 'anaerobic digestion',
  'wastewater treatment', 'remediation', 'nanoplastics',
  // Microbiologie non alimentaire et antimicrobiens
  'Pseudomonas', 'Acinetobacter', 'baumannii', 'Aspergillus', 'antifungal',
  'antifungal activity', 'antibacterial activity', 'antimicrobial properties',
  'against multidrug-resistant', 'carbapenem',
  // Méthodes d'analyse et informatique
  'in silico', 'molecular docking', 'molecular dynamics', 'electrochemical', 'colorimetric',
  'hyperspectral', 'rapid detection', 'sensitive detection', 'molecular detection', 'cell line',
  'mesenchymal stem',
  // Réglementaire et divers
  'reasoned opinion', 'existing MRLs', 'active substance', 'pesticide risk',
  'iron sucrose', 'sucrose preference', 'sucrose gradient', 'sucrose gradients',
  'chemical oxygen demand',
];

// Un titre qui contient aussi l'un de ces marqueurs humains n'est pas exclu.
// À VÉRIFIER : doit être identique à la liste utilisée dans import-etudes.js.
const MARQUEURS_HUMAINS = [
  'human', 'humans', 'men', 'women', 'adult', 'adults', 'older adults', 'elderly',
  'children', 'adolescents', 'infants', 'patients', 'participants', 'volunteers',
  'subjects', 'trial', 'randomized', 'randomised',
];

// Clause Europe PMC à placer après le sujet : NOT ((mots exclus) AND NOT (marqueurs humains))
function clauseExclusion() {
  const exclusion = MOTS_EXCLUS_TITRE.map((m) => `TITLE:"${m}"`).join(' OR ');
  const humains = MARQUEURS_HUMAINS.map((m) => `TITLE:"${m}"`).join(' OR ');
  return `NOT ((${exclusion}) AND NOT (${humains}))`;
}

module.exports = { MOTS_EXCLUS_TITRE, MARQUEURS_HUMAINS, clauseExclusion };
