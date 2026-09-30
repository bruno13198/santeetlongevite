// Script d'automatisation : récupère des études sur Europe PMC pour les aliments,
// les trie, génère 2 résumés en français via l'API Claude, classe leur niveau de preuve,
// et enregistre tout dans Supabase.
//
// Recherche : termes_recherche cherchés en texte libre dans le titre et le résumé,
// fenêtre sur FIRST_IDATE (date d'entrée dans Europe PMC). Pas de filtre PUB_TYPE :
// les articles récents n'ont pas encore de type de publication (méta-analyse, essai...).
// Les titres signalant clairement un sujet animal/végétal sont exclus dès la requête.
// Toutes les pages de résultats sont lues (jusqu'à RESULTATS_A_RECUPERER).
// La requête est envoyée en POST (searchPOST) : la liste d'exclusions est trop longue
// pour tenir dans une adresse web (erreurs 400/414 en GET, 29 sept. 2026).
//
// Tri en deux temps pour maîtriser les coûts :
//   1. Haiku (rapide, économique) écarte uniquement les cas CLAIREMENT hors sujet ;
//      dans le doute, il laisse passer. Ses rejets sont marqués [Haiku].
//   2. Sonnet juge finement la pertinence et rédige les résumés.
// Une étude déjà en base (acceptée pour un autre aliment) passe par le même tri
// avant d'être reliée à cet aliment.
//
// Niveau de preuve (30 sept. 2026) : échelle d'Oxford (CEBM 2011), étude par étude
// (niveau_preuve, design_etude, ajustement_preuve). L'ancien champ niveau_fiabilite
// reste rempli par correspondance pendant la transition.
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
const RESULTATS_A_RECUPERER = parseInt(process.env.RESULTATS_A_RECUPERER || '500', 10); // maximum total, toutes pages confondues
const TAILLE_PAGE_EUROPEPMC = 100;
const MAX_NOUVELLES_ETUDES_PAR_RUN = parseInt(process.env.MAX_NOUVELLES_ETUDES_PAR_RUN || '15', 10);
const MAX_ANALYSES_PAR_RUN = parseInt(process.env.MAX_ANALYSES_PAR_RUN || '25', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const LIMITE = parseInt(process.env.LIMITE || '200', 10);
const JOURS_VEILLE = parseInt(process.env.JOURS_VEILLE || '10', 10);
 
const MODELE_TRI = 'claude-haiku-4-5-20251001';
const MODELE_ANALYSE = 'claude-sonnet-5';
const DELAI_MAX_MS = 60000; // délai maximal pour chaque appel réseau
const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';
 
const EXCEPTIONS_NOVA4 = [
  'isolat-de-soja',
  'cola-sucre',
  'lecithine-de-soja',
  'kimchi',
  'kombucha',
  'substitut-de-repas-hypocalorique-pret-a-boire',
  'proteine-de-soja-texturee-rehydratee',
];
 
// Mots de TITRE signalant clairement un sujet animal, végétal, informatique
// ou matériau. Liste volontairement prudente : pas de "cows", "sheep", "goats"
// (lait de vache/brebis/chèvre chez l'humain) ni "in vitro" (fécondation in vitro).
// "poultry" seul retiré le 28 sept. 2026 (bloquait "poultry consumption").
// Tous les mots et expressions ci-dessous sont absents des titres d'études acceptées.
// Exception (chercherEtudesEuropePMC) : un titre contenant aussi un marqueur humain
// ("humans", "patients", "trial"...) n'est pas exclu.
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
 
function formaterDate(date) {
  return date.toISOString().split('T')[0];
}
 
function normaliserTypeEtude(pubTypeList) {
  if (!pubTypeList || pubTypeList.length === 0) return null;
  const types = pubTypeList.map((t) => t.toLowerCase());
 
  if (types.includes('meta-analysis')) return 'Méta-analyse';
  if (types.includes('systematic review')) return 'Revue systématique';
  if (types.some((t) => t.includes('scoping review'))) return 'Revue de portée';
  if (types.includes('randomized controlled trial')) return 'Essai contrôlé randomisé';
  if (types.includes('clinical trial')) return 'Essai clinique';
  if (types.some((t) => t.includes('cohort'))) return 'Étude de cohorte';
  if (types.some((t) => t.includes('case-control'))) return 'Étude cas-témoins';
  if (types.some((t) => t.includes('cross-sectional') || t.includes('observational'))) return 'Étude transversale';
  if (types.some((t) => t.includes('comparative study'))) return 'Étude comparative';
  if (types.some((t) => t.includes('review'))) return 'Revue narrative';
  return null;
}
 
function extraireNbParticipants(abstractText) {
  if (!abstractText) return null;
 
  // Retire les balises HTML qui peuvent s'intercaler (ex: <i>n</i> = 31)
  const texte = abstractText.replace(/<[^>]+>/g, '');
 
  const nombresEnLettres = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };
 
  function motEnNombre(mot) {
    const parties = mot.toLowerCase().split('-');
    if (parties.length === 2 && nombresEnLettres[parties[0]] && nombresEnLettres[parties[1]]) {
      return nombresEnLettres[parties[0]] + nombresEnLettres[parties[1]];
    }
    return nombresEnLettres[mot.toLowerCase()] || null;
  }
 
  // Cas 1 : "n = 31" ou "n=31" — on prend la première occurrence valide
  for (const match of texte.matchAll(/\bn\s*=\s*(\d[\d,\s]{0,6})/gi)) {
    const parsed = parseInt(match[1].replace(/[,\s]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 100000) return parsed;
  }
 
  // Cas 2 : un nombre en chiffres suivi (dans les 3 mots suivants) de participants/patients/...
  for (const match of texte.matchAll(
    /(\d[\d,]{0,6})\s+(?:\w+\s+){0,3}?(participants|patients|subjects|adults|volunteers|individuals|men|women|males|females|children|adolescents)/gi
  )) {
    const parsed = parseInt(match[1].replace(/,/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 100000) return parsed;
  }
 
  // Cas 3 : nombre écrit en toutes lettres (ex: "Sixty-seven hypercholesterolemic individuals")
  for (const match of texte.matchAll(
    /\b([A-Za-z]+(?:-[A-Za-z]+)?)\s+(?:\w+\s+){0,3}?(participants|patients|subjects|adults|volunteers|individuals|men|women|males|females|children|adolescents)/gi
  )) {
    const nombre = motEnNombre(match[1]);
    if (nombre && nombre > 0) return nombre;
  }
 
  return null;
}
 
async function recupererAlimentsATraiter() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom, slug, niveau_nova, terme_recherche, termes_recherche')
    .eq('actif', true)
    .order('id', { ascending: true })
    .range(0, 4999); // sans range, Supabase s'arrête à 1000 lignes
 
  if (error) {
    throw new Error(`Erreur récupération aliments: ${error.message}`);
  }
 
  const eligibles = aliments
    .filter((a) => [1, 2, 3].includes(a.niveau_nova) || EXCEPTIONS_NOVA4.includes(a.slug))
    .filter(
      (a) =>
        (Array.isArray(a.termes_recherche) && a.termes_recherche.length > 0) ||
        (a.terme_recherche && a.terme_recherche.trim() !== '')
    );
 
  const slugsCibles = process.env.SLUGS_CIBLES;
  if (slugsCibles) {
    const listeSlugs = slugsCibles.split(',').map((s) => s.trim());
    return eligibles.filter((a) => listeSlugs.includes(a.slug));
  }
 
  return eligibles;
}
 
// Appel Europe PMC en POST (searchPOST), avec délai maximal et nouvelles tentatives
// (délai croissant) pour les erreurs temporaires uniquement.
// L'erreur renvoyée porte un indicateur "temporaire" : les erreurs définitives
// (400, 414...) ne sont pas reprises en fin de run.
async function appelerEuropePMC(parametres, tentative = 1) {
  const ERREURS_TEMPORAIRES = [429, 500, 502, 503, 504];
  const corps = new URLSearchParams(parametres).toString();
 
  let res;
  try {
    res = await fetch(URL_EUROPEPMC_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps,
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
  } catch (e) {
    if (tentative < 5) {
      const delai = 3000 * Math.pow(2, tentative - 1);
      console.log(`  Europe PMC ne répond pas (${e.name}), nouvelle tentative dans ${delai / 1000}s (${tentative + 1}/5)...`);
      await new Promise((resolve) => setTimeout(resolve, delai));
      return appelerEuropePMC(parametres, tentative + 1);
    }
    const erreur = new Error(`Europe PMC injoignable : ${e.message}`);
    erreur.temporaire = true;
    throw erreur;
  }
 
  if (!res.ok) {
    if (ERREURS_TEMPORAIRES.includes(res.status) && tentative < 5) {
      const delai = 3000 * Math.pow(2, tentative - 1);
      console.log(`  Europe PMC indisponible (${res.status}), nouvelle tentative dans ${delai / 1000}s (${tentative + 1}/5)...`);
      await new Promise((resolve) => setTimeout(resolve, delai));
      return appelerEuropePMC(parametres, tentative + 1);
    }
    let detail = '';
    try {
      detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 200);
    } catch (e) {
      // corps de réponse illisible : on se contente du code
    }
    const erreur = new Error(`Europe PMC erreur ${res.status}${detail ? ` : ${detail}` : ''}`);
    erreur.temporaire = ERREURS_TEMPORAIRES.includes(res.status);
    throw erreur;
  }
 
  return res.json();
}
 
async function chercherEtudesEuropePMC(aliment) {
  // - termes_recherche (text[]) : chaque terme cherché comme expression exacte,
  //   variantes reliées par OR. Mode cible.
  // - terme_recherche (chaîne, hérité) : mots découpés et reliés par AND.
  const termesMultiples = aliment.termes_recherche;
 
  let motsClefs;
 
  if (Array.isArray(termesMultiples) && termesMultiples.length > 0) {
    motsClefs = termesMultiples
      .map((t) => `(TITLE:"${t}" OR ABSTRACT:"${t}")`)
      .join(' OR ');
  } else {
    // Retire un nom scientifique latin (Genre espèce) en fin de terme,
    // ex. "garlic Allium sativum" -> "garlic"
    const termeSansNomScientifique = aliment.terme_recherche.replace(
      /\s+[A-Z][a-zà-ÿ]+\s+[a-zà-ÿ]+$/,
      ''
    );
    motsClefs = termeSansNomScientifique
      .split(' ')
      .map((mot) => `(TITLE:"${mot}" OR ABSTRACT:"${mot}")`)
      .join(' AND ');
  }
 
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - JOURS_VEILLE);
  const filtreDate = `AND (FIRST_IDATE:[${formaterDate(dateDebut)} TO ${formaterDate(new Date())}])`;
 
  const exclusionTitre = MOTS_EXCLUS_TITRE.map((m) => `TITLE:"${m}"`).join(' OR ');
  // Exception (28 sept. 2026) : un titre qui contient aussi un marqueur humain explicite
  // n'est pas exclu (ex. "... in humans and mice", "... in healthy young men and rats").
  // Haiku et Sonnet trancheront ensuite normalement.
  const MARQUEURS_HUMAINS = [
    'human', 'humans', 'men', 'women', 'adult', 'adults', 'older adults', 'elderly',
    'children', 'adolescents', 'infants', 'patients', 'participants', 'volunteers',
    'subjects', 'trial', 'randomized', 'randomised',
  ];
  const marqueursHumains = MARQUEURS_HUMAINS.map((m) => `TITLE:"${m}"`).join(' OR ');
  const requete = `(${motsClefs}) AND (SRC:MED) NOT ((${exclusionTitre}) AND NOT (${marqueursHumains})) ${filtreDate}`;
 
  // Lecture de toutes les pages (curseur Europe PMC), jusqu'au maximum fixé.
  const resultats = [];
  let total = 0;
  let cursorMark = '*';
 
  while (resultats.length < RESULTATS_A_RECUPERER) {
    const data = await appelerEuropePMC({
      query: requete,
      format: 'json',
      pageSize: String(TAILLE_PAGE_EUROPEPMC),
      cursorMark,
      resultType: 'core',
    });
 
    total = data.hitCount || 0;
    const page = data.resultList?.result || [];
    resultats.push(...page);
 
    if (page.length === 0 || !data.nextCursorMark || data.nextCursorMark === cursorMark) break;
    cursorMark = data.nextCursorMark;
    await new Promise((resolve) => setTimeout(resolve, 300)); // pause entre deux pages
  }
 
  return {
    resultats: resultats.slice(0, RESULTATS_A_RECUPERER),
    total,
  };
}
 
// Appel générique à l'API Claude, avec délai maximal. Renvoie le texte brut.
async function appelerClaude(modele, maxTokens, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modele,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
 
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur API Claude ${res.status}: ${errText}`);
  }
 
  const data = await res.json();
  return data.content.map((b) => b.text || '').join('');
}
 
function extraireJSON(texte) {
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  return { nettoye, objet: JSON.parse(match ? match[0] : nettoye) };
}
 
// Tri rapide par Haiku : n'écarte que les cas CLAIREMENT hors sujet.
// En cas de doute ou d'erreur, laisse passer (Sonnet tranchera).
// 28 sept. 2026 : ajout des catégories que Sonnet rejette systématiquement
// (contamination, technologie, enquêtes sans issue de santé, méthodes d'analyse),
// pour ne plus consommer le garde-fou d'analyses Sonnet sur ces études.
async function trierPertinence(titreOriginal, abstractOriginal, nomAliment) {
  const prompt = `Tu fais un PREMIER TRI RAPIDE d'études scientifiques pour une fiche sur l'aliment : ${nomAliment}

Titre : ${titreOriginal}
Résumé : ${abstractOriginal}

Réponds "false" UNIQUEMENT si l'étude est CLAIREMENT dans l'un de ces cas :
- elle porte uniquement sur des animaux, des cellules ou des modèles in vitro/in silico, sans aucun sujet humain ;
- le terme de recherche est un homonyme ou une confusion (autre sens du mot, autre espèce, nom d'un appareil, d'une marque, d'une enzyme, d'une molécule sans rapport...) ;
- l'aliment n'a aucun rapport réel avec le sujet de l'étude (absent, ou mentionné seulement en passant) ;
- l'étude porte sur de l'agronomie, de la génétique végétale, de l'élevage, de l'alimentation animale, un procédé industriel ou un matériau, sans consommation humaine ;
- il s'agit d'un usage uniquement cutané, topique ou cosmétique ;
- il s'agit d'un protocole sans résultats ou d'une notice de rétractation ;
- elle mesure seulement une contamination de l'aliment (bactéries, résistance aux antibiotiques, virus, parasites, métaux, pesticides, mycotoxines, microplastiques), éventuellement avec un calcul de risque théorique, sans aucun effet de santé observé chez des personnes ;
- elle porte sur la formulation, la texture, la conservation, les propriétés physico-chimiques ou l'analyse sensorielle d'un produit, sans effet de santé mesuré chez des personnes ;
- c'est une enquête sur les achats, les connaissances, les attitudes ou la fréquence de consommation, sans lien mesuré avec un effet de santé ;
- elle développe ou valide une méthode d'analyse, de dosage, de détection ou d'authentification.

Dans TOUS les autres cas, y compris en cas de doute, réponds "true" : une analyse plus fine sera faite ensuite.
Une étude chez l'humain qui ne trouve AUCUN effet ou AUCUNE association avec l'aliment est un résultat valable : réponds "true".

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après :
{"pertinent": true}
ou
{"pertinent": false, "raison": "une phrase courte en français"}`;

  try {
    const texte = await appelerClaude(MODELE_TRI, 200, prompt);
    const { objet } = extraireJSON(texte);
    if (objet.pertinent === false) {
      return { pertinent: false, raison: objet.raison || 'hors sujet' };
    }
    return { pertinent: true };
  } catch (e) {
    console.log(`      Tri Haiku indisponible (${e.message.slice(0, 80)}), on laisse passer à l'analyse.`);
    return { pertinent: true };
  }
}
 
async function analyserEtude(titreOriginal, abstractOriginal, nomAliment, tentative = 1) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
Cette étude a été trouvée en recherchant des publications sur : ${nomAliment}
 
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
Étape 1 — Vérifie le SUJET :
L'étude apporte-t-elle une information utile sur « ${nomAliment} » ? Réponds "true" dans tous ces cas :
- l'étude porte sur l'aliment lui-même, consommé tel quel
- l'étude porte sur un extrait, un composé isolé, une huile ou une préparation ISSUE de cet aliment et INGÉRÉE (ex : curcumine pour le curcuma, huile de foie de morue pour le foie de morue, peptides de chia pour la graine de chia)
- l'étude porte sur une variante voisine de l'aliment, ou sur la catégorie étroite à laquelle il appartient, lorsque c'est la littérature la plus proche disponible (ex : une étude sur « lait écrémé » pour une fiche « lait écrémé UHT » ; une étude sur les fromages à pâte molle pour un fromage à pâte molle précis)
- des détails de procédé secondaires (UHT, séché, moulu, cru vs cuit) ne suffisent PAS à rendre une étude non pertinente, sauf si l'étude porte précisément sur ce paramètre et conclut à une différence
Réponds "false" uniquement si : une simple co-occurrence de mots-clés ou une confusion terminologique (ex : un homonyme, une espèce réellement différente, un aliment qui n'apparaît que dans la bibliographie ou en comparaison lointaine), ou si l'étude porte en réalité sur un autre sujet mal indexé sous ce terme de recherche.
En cas d'hésitation entre pertinent et non pertinent à cette étape, réponds "true" : mieux vaut une étude un peu large sur une fiche qu'une fiche vide.
 
Étape 2 — Évalue la pertinence humaine :
Cette étude mesure-t-elle un EFFET ou un BÉNÉFICE (sur la santé, une maladie, un marqueur biologique...) directement chez des sujets HUMAINS, ou via une méta-analyse/revue qui synthétise de tels résultats humains ?
Réponds "false" dans les cas suivants :
- L'étude porte uniquement sur des animaux, des cellules en laboratoire (in vitro), ou des plantes (agronomie, botanique), SANS effet mesuré chez l'humain.
- L'étude décrit seulement l'absorption, le métabolisme ou la biodisponibilité d'un composé chez l'humain, mais SANS mesurer un effet ou bénéfice de santé concret chez l'humain. La simple présence de données pharmacocinétiques humaines ne suffit pas si l'effet biologique testé n'a été observé qu'en laboratoire ou chez l'animal.
- L'étude évalue un usage TOPIQUE, CUTANÉ ou COSMÉTIQUE de « ${nomAliment} » (crème, gel, lotion, gant enduit, application sur la peau...), plutôt qu'une CONSOMMATION ALIMENTAIRE (ingestion orale). Un bénéfice observé sur la peau ou via une application externe ne compte pas, même s'il est mesuré chez l'humain.
- L'étude porte sur un micro-organisme, une toxine, un contaminant ou un procédé industriel lié à l'aliment, sans mesurer d'effet de sa consommation chez l'humain (ex : la biosynthèse d'un champignon d'affinage, la prévalence d'une bactérie, un procédé de fabrication).
- L'aliment sert uniquement de repas témoin, de comparateur ou de véhicule pour tester autre chose (un médicament, un nutriment ajouté, un autre aliment), sans qu'un effet propre lui soit attribué.
- L'aliment n'est qu'un facteur parmi de nombreux autres (habitudes de vie, score combiné, questionnaire alimentaire global, liste d'allergènes) sans qu'un effet ou une association propre à cet aliment soit rapporté.
- Pour les allergies : une étude sur la tolérance, la désensibilisation, l'introduction ou la réintroduction de cet aliment chez des personnes allergiques EST pertinente ; une étude qui recense seulement une sensibilisation parmi de nombreux allergènes, ou qui porte uniquement sur les conséquences de l'éviction de l'aliment, ne l'est pas.
- Il s'agit d'un éditorial, d'un commentaire, d'une lettre ou d'un protocole d'étude sans résultats.
- Tout autre sujet hors nutrition/santé humaine.
Ne réponds "true" que si un effet ou bénéfice a été concrètement évalué chez des sujets humains suite à une consommation alimentaire (essai clinique, cohorte, méta-analyse de données humaines).
 
Étape 3 — Si et seulement si pertinente sur les deux points ci-dessus, rédige les résumés en français.
 
Réponds UNIQUEMENT avec un objet JSON valide (rien avant, rien après), au format EXACT suivant. N'utilise JAMAIS de guillemets doubles (") à l'intérieur des textes — utilise des guillemets français « » ou des apostrophes si besoin. N'utilise JAMAIS de retour à la ligne à l'intérieur des valeurs texte — rédige chaque champ comme un seul paragraphe continu, sans saut de ligne.
 
Si l'étude N'EST PAS pertinente :
{
  "pertinent": false,
  "raison": "courte explication en français (une phrase)"
}
 
Si l'étude EST pertinente :
{
  "pertinent": true,
  "titre_traduit": "traduction française naturelle du titre",
  "resume_simplifie": "un résumé très simple et accessible en français (80-120 mots), sans jargon, compréhensible par un lecteur non-scientifique",
  "resume_reformule": "une reformulation plus détaillée en français (100-150 mots), qui garde davantage de nuance scientifique et de précision, mais reste lisible"
}
 
Règles importantes :
- Ne jamais transformer une corrélation en causalité si l'étude ne le permet pas
- Rester factuel, ne pas exagérer les conclusions
- Varier le style et la structure des phrases (éviter les formulations répétitives d'un résumé à l'autre)
- Rédiger uniquement en français`;
 
  const texte = await appelerClaude(MODELE_ANALYSE, 1500, prompt);
 
  try {
    return extraireJSON(texte).objet;
  } catch (e) {
    if (tentative < 3) {
      console.log(`  Réponse d'analyse incomplète, nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return analyserEtude(titreOriginal, abstractOriginal, nomAliment, tentative + 1);
    }
    throw new Error(`JSON invalide reçu de Claude après 3 tentatives : ${e.message} | Début du texte reçu : ${texte.slice(0, 200)}`);
  }
}
 
// Niveau de preuve selon l'échelle d'Oxford (CEBM 2011), étude par étude,
// pour la question « cet aliment a-t-il cet effet ? ». Évalué à partir du titre
// et du résumé uniquement. Renvoie { niveau (1-5), design, ajustement } ou null.
const DESIGNS_AUTORISES = [
  "Méta-analyse d'essais randomisés",
  "Revue systématique d'essais randomisés",
  "Revue parapluie d'essais randomisés",
  'Essai randomisé contrôlé',
  'Essai croisé randomisé',
  'Essai non randomisé',
  'Étude pilote sans groupe témoin',
  "Méta-analyse d'études observationnelles",
  "Revue systématique d'études observationnelles",
  "Revue parapluie d'études observationnelles",
  'Étude de cohorte prospective',
  'Étude de cohorte rétrospective',
  'Randomisation mendélienne',
  'Étude cas-témoins',
  'Étude transversale',
  'Série de cas',
  'Cas clinique',
  'Revue narrative',
  'Autre',
];
 
async function classerNiveauPreuve(titre, resumeOriginal, tentative = 1) {
  const prompt = `Tu es un méthodologiste en médecine fondée sur les preuves. Classe l'étude ci-dessous selon l'échelle des niveaux de preuve d'Oxford (CEBM 2011), pour la question « cet aliment ou ce composé alimentaire a-t-il cet effet sur la santé ? ». Base-toi uniquement sur le titre et le résumé.

Titre : ${titre}
Résumé : ${resumeOriginal}

1. Identifie le type d'étude, en choisissant EXACTEMENT un libellé de cette liste :
${DESIGNS_AUTORISES.map((d) => `- ${d}`).join('\n')}
Pour une méta-analyse mêlant essais et études observationnelles, choisis selon le type d'études majoritaire ; si les essais randomisés sont analysés séparément, choisis la version « essais randomisés ».

2. Donne le niveau de BASE correspondant au type d'étude :
- Niveau 1 : revue systématique, méta-analyse ou revue parapluie d'ESSAIS RANDOMISÉS.
- Niveau 2 : essai randomisé contrôlé (y compris croisé).
- Niveau 3 : essai non randomisé contrôlé, étude de cohorte, randomisation mendélienne, ou revue systématique / méta-analyse / revue parapluie d'études observationnelles.
- Niveau 4 : étude cas-témoins, étude transversale, étude pilote sans groupe témoin, série de cas, cas clinique.
- Niveau 5 : revue narrative ou raisonnement mécanistique (mécanismes, études cellulaires ou animales, hypothèses).

3. Indique un éventuel ajustement : "abaisse", "releve" ou "aucun".
- "abaisse" UNIQUEMENT pour l'un de ces défauts majeurs, visible dans le résumé : effectif STRICTEMENT inférieur à 30 participants au total (30 ou plus : aucun abaissement pour l'effectif) ; absence de groupe témoin ou de placebo alors que le type d'étude en supposerait un ; résultats explicitement très imprécis ou incohérents (par exemple une forte hétérogénéité non expliquée dans une méta-analyse).
- N'abaisse PAS parce que le produit testé est un extrait, un complément, un composé isolé ou un mélange : cette distinction est traitée ailleurs.
- "releve" seulement pour un effet très important et net, rare dans ce domaine.
- En cas de doute : "aucun".

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"design": "libellé exact de la liste", "niveau_base": 2, "ajustement": "aucun", "motif": ""}
ou, en cas d'ajustement :
{"design": "Essai randomisé contrôlé", "niveau_base": 2, "ajustement": "abaisse", "motif": "24 participants"}`;

  let texte = '';
  try {
    texte = await appelerClaude(MODELE_ANALYSE, 500, prompt);
    const { objet } = extraireJSON(texte);
    const base = parseInt(objet.niveau_base, 10);
    if (!(base >= 1 && base <= 5)) throw new Error('Niveau de base invalide');
    const design = DESIGNS_AUTORISES.includes(objet.design) ? objet.design : 'Autre';
    // Le niveau final est calculé ici, pas par le modèle : un ajustement annoncé est toujours appliqué.
    const sens = objet.ajustement === 'abaisse' ? 1 : objet.ajustement === 'releve' ? -1 : 0;
    const niveau = Math.min(5, Math.max(1, base + sens));
    const motif = typeof objet.motif === 'string' ? objet.motif.trim() : '';
    const ajustement =
      niveau === base ? null : `${sens === 1 ? 'Abaissé' : 'Relevé'}${motif ? ` : ${motif}` : ''}`;
    return { niveau, design, ajustement };
  } catch (e) {
    if (tentative < 3) {
      console.log(`      Réponse niveau de preuve incomplète ("${texte.slice(0, 80)}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * tentative));
      return classerNiveauPreuve(titre, resumeOriginal, tentative + 1);
    }
    console.log(`      Échec classement niveau de preuve après 3 tentatives. Dernière réponse reçue : "${texte.slice(0, 200)}"`);
    return null;
  }
}
 
// Correspondance transitoire avec l'ancien champ niveau_fiabilite, encore utilisé
// par le site tant que les badges Oxford ne sont pas en place.
function niveauFiabiliteDepuisPreuve(niveau) {
  if (niveau === 1) return 'haute';
  if (niveau === 2) return 'moderee';
  if (niveau >= 3 && niveau <= 5) return 'preliminaire';
  return null;
}
 
async function enregistrerRejet(alimentId, sourceId, titre, raison) {
  await supabase.from('candidats_rejetes').insert({
    aliment_id: alimentId,
    source_id: sourceId,
    titre_original: titre,
    raison: raison,
  });
}
 
async function traiterAliment(aliment) {
  console.log(`\n=== ${aliment.slug} ===`);
 
  const { resultats, total } = await chercherEtudesEuropePMC(aliment);
  console.log(`  ${total} résultats au total sur Europe PMC, ${resultats.length} examinés${total > resultats.length ? ' ⚠️ DÉBORDEMENT' : ''}.`);
  await new Promise((resolve) => setTimeout(resolve, 300)); // pause pour éviter de saturer Europe PMC
 
  // Déduplication défensive : Europe PMC peut renvoyer le même article deux fois.
  const dejaVusDansCeLot = new Set();
  const resultatsUniques = resultats.filter((etude) => {
    const sourceId = etude.id || etude.pmid;
    if (!sourceId || dejaVusDansCeLot.has(sourceId)) return false;
    dejaVusDansCeLot.add(sourceId);
    return true;
  });
 
  let nouvellesEtudesAjoutees = 0;
  let analysesEffectuees = 0;
 
  for (const etude of resultatsUniques) {
    const sourceId = etude.id || etude.pmid;
    if (!sourceId) continue;
 
    const { data: existant } = await supabase
      .from('etudes')
      .select('id')
      .eq('source', 'Europe PMC')
      .eq('source_id', sourceId)
      .maybeSingle();
 
    if (existant) {
      const { data: lienExistant } = await supabase
        .from('aliments_etudes')
        .select('aliment_id')
        .eq('aliment_id', aliment.id)
        .eq('etude_id', existant.id)
        .maybeSingle();
 
      if (lienExistant) {
        console.log(`  - Déjà en base et déjà liée (${sourceId}), on passe.`);
        continue;
      }
    }
 
    const { data: dejaRejete } = await supabase
      .from('candidats_rejetes')
      .select('source_id')
      .eq('aliment_id', aliment.id)
      .eq('source_id', sourceId)
      .maybeSingle();
 
    if (dejaRejete) {
      console.log(`  - Déjà rejeté précédemment pour cet aliment (${sourceId}), on passe.`);
      continue;
    }
 
    // Garde-fous (appels Claude coûteux à partir d'ici)
    if (!existant && nouvellesEtudesAjoutees >= MAX_NOUVELLES_ETUDES_PAR_RUN) {
      console.log(`  - Garde-fou de ${MAX_NOUVELLES_ETUDES_PAR_RUN} nouvelles études atteint pour ce run, on arrête ici.`);
      break;
    }
    if (analysesEffectuees >= MAX_ANALYSES_PAR_RUN) {
      console.log(`  - Garde-fou de ${MAX_ANALYSES_PAR_RUN} analyses Sonnet atteint pour ce run, on arrête ici.`);
      break;
    }
 
    if (!etude.abstractText) {
      console.log(`  - Pas de résumé disponible pour ${sourceId}, on passe.`);
      continue;
    }
 
    try {
      // 1. Tri rapide Haiku
      const tri = await trierPertinence(etude.title, etude.abstractText, aliment.nom);
      if (!tri.pertinent) {
        console.log(`  - Écartée au tri (${sourceId}) : ${tri.raison}`);
        await enregistrerRejet(aliment.id, sourceId, etude.title, `[Haiku] ${tri.raison}`);
        continue;
      }
 
      // 2. Analyse fine Sonnet
      analysesEffectuees++;
      const analyse = await analyserEtude(etude.title, etude.abstractText, aliment.nom);
 
      if (!analyse.pertinent) {
        console.log(`  - Écartée (${sourceId}) : ${analyse.raison}`);
        await enregistrerRejet(aliment.id, sourceId, etude.title, analyse.raison);
        continue;
      }
 
      // Étude déjà en base pour un autre aliment : on la relie seulement
      // (les résumés existants ne sont pas modifiés).
      if (existant) {
        await supabase.from('aliments_etudes').insert({
          aliment_id: aliment.id,
          etude_id: existant.id,
        });
        console.log(`  - Déjà en base (${sourceId}), jugée pertinente et reliée à cet aliment.`);
        continue;
      }
 
      // 3. Niveau de preuve (Oxford CEBM 2011)
      const preuve = await classerNiveauPreuve(etude.title, etude.abstractText);
      const niveauFiabilite = niveauFiabiliteDepuisPreuve(preuve?.niveau);
      await new Promise((resolve) => setTimeout(resolve, 500));
 
      let etudeId;
      const { data: nouvelleEtude, error: erreurInsert } = await supabase
        .from('etudes')
        .insert({
          titre_original: etude.title,
          titre_traduit: analyse.titre_traduit,
          source: 'Europe PMC',
          source_id: sourceId,
          url_originale: `https://europepmc.org/article/MED/${sourceId}`,
          date_publication: etude.firstPublicationDate || null,
          auteurs: etude.authorString || null,
          resume_original: etude.abstractText,
          resume_simplifie: analyse.resume_simplifie,
          resume_reformule: analyse.resume_reformule,
          niveau_fiabilite: niveauFiabilite,
          niveau_preuve: preuve?.niveau ?? null,
          design_etude: preuve?.design ?? null,
          ajustement_preuve: preuve?.ajustement ?? null,
          type_etude: normaliserTypeEtude(etude.pubTypeList?.pubType),
          nb_participants: extraireNbParticipants(etude.abstractText),
        })
        .select('id')
        .single();
 
      if (erreurInsert) {
        if (erreurInsert.code === '23505') {
          const { data: etudeExistante } = await supabase
            .from('etudes')
            .select('id')
            .eq('source', 'Europe PMC')
            .eq('source_id', sourceId)
            .single();
 
          if (!etudeExistante) {
            console.log(`  - Conflit d'insertion pour ${sourceId}, mais étude introuvable ensuite :`, erreurInsert.message);
            continue;
          }
          etudeId = etudeExistante.id;
        } else {
          console.log(`  - Erreur insertion étude ${sourceId}:`, erreurInsert.message);
          continue;
        }
      } else {
        etudeId = nouvelleEtude.id;
      }
 
      const { data: lienExistant } = await supabase
        .from('aliments_etudes')
        .select('aliment_id')
        .eq('aliment_id', aliment.id)
        .eq('etude_id', etudeId)
        .maybeSingle();
 
      if (lienExistant) {
        console.log(`  - Déjà liée à cet aliment (${sourceId}), on passe.`);
        continue;
      }
 
      await supabase.from('aliments_etudes').insert({
        aliment_id: aliment.id,
        etude_id: etudeId,
      });
 
      nouvellesEtudesAjoutees++;
      const etiquettePreuve = preuve
        ? `Niveau ${preuve.niveau} — ${preuve.design}${preuve.ajustement ? ` (${preuve.ajustement})` : ''}`
        : 'niveau inconnu';
      console.log(`  - Ajoutée (${etiquettePreuve}) : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }
}
 
async function main() {
  console.log(`Paramètres de ce run : OFFSET=${OFFSET}, LIMITE=${LIMITE}, JOURS_VEILLE=${JOURS_VEILLE}, RESULTATS_A_RECUPERER=${RESULTATS_A_RECUPERER}, MAX_NOUVELLES=${MAX_NOUVELLES_ETUDES_PAR_RUN}, MAX_ANALYSES=${MAX_ANALYSES_PAR_RUN}`);
  const tousLesAliments = await recupererAlimentsATraiter();
  const lot = tousLesAliments.slice(OFFSET, OFFSET + LIMITE);
  console.log(`${tousLesAliments.length} aliments éligibles au total. Lot traité : offset ${OFFSET}, ${lot.length} aliments (jusqu'à l'offset ${OFFSET + lot.length}).`);

  // Premier passage. Les échecs temporaires (Europe PMC indisponible) sont mis de côté
  // pour être repris ; les échecs définitifs (requête refusée : 400, 414...) ne le sont pas.
  let enEchec = [];
  const echecsDefinitifs = [];
  for (const aliment of lot) {
    try {
      await traiterAliment(aliment);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
      if (e.temporaire === false) {
        echecsDefinitifs.push({ aliment, message: e.message });
      } else {
        enEchec.push({ aliment, message: e.message });
      }
    }
  }

  // Reprises en fin de run, après une pause, pour laisser à Europe PMC le temps de revenir.
  const PAUSES_REPRISE_MIN = [5, 15];
  for (let passe = 0; passe < PAUSES_REPRISE_MIN.length && enEchec.length > 0; passe++) {
    const pause = PAUSES_REPRISE_MIN[passe];
    console.log(`\n${enEchec.length} aliment(s) en échec. Reprise ${passe + 1}/${PAUSES_REPRISE_MIN.length} dans ${pause} min : ${enEchec.map((x) => x.aliment.slug).join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, pause * 60 * 1000));

    const encoreEnEchec = [];
    for (const { aliment } of enEchec) {
      try {
        await traiterAliment(aliment);
      } catch (e) {
        console.log(`Erreur générale (reprise ${passe + 1}) sur ${aliment.slug}:`, e.message);
        if (e.temporaire === false) {
          echecsDefinitifs.push({ aliment, message: e.message });
        } else {
          encoreEnEchec.push({ aliment, message: e.message });
        }
      }
    }
    enEchec = encoreEnEchec;
  }

  // Seuls les échecs définitifs (ou persistants après reprises) sont enregistrés.
  const tousLesEchecs = [...echecsDefinitifs, ...enEchec];
  for (const { aliment, message } of tousLesEchecs) {
    await supabase.from('erreurs_import').insert({
      aliment_slug: aliment.slug,
      type_erreur: 'echec_recherche',
      message,
    });
  }

  if (tousLesEchecs.length > 0) {
    console.log(`\n⚠️ ${tousLesEchecs.length} aliment(s) toujours en échec. À relancer via slugs_cibles :`);
    console.log(tousLesEchecs.map((x) => x.aliment.slug).join(','));
  } else {
    console.log('\nAucun aliment en échec.');
  }
  console.log('\nTerminé.');
}
 
main();

 
