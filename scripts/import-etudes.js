// Script d'automatisation : récupère des études sur Europe PMC pour les aliments,
// les trie, génère 2 résumés en français via l'API Claude, classe leur niveau de preuve,
// et enregistre tout dans Supabase.
//
// Recherche : termes_recherche cherchés en texte libre dans le titre et le résumé,
// fenêtre sur FIRST_IDATE (date d'entrée dans Europe PMC). Pas de filtre PUB_TYPE :
// les articles récents n'ont pas encore de type de publication (méta-analyse, essai...).
// Les titres signalant clairement un sujet animal/végétal sont exclus dès la requête.
// Toutes les pages de résultats sont lues (jusqu'au quota de résultats de l'aliment).
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
// (niveau_preuve, design_etude, ajustement_preuve). Le modèle donne le niveau de base,
// le sens de l'ajustement et l'effectif ; le script calcule le niveau final.
// L'effectif (nb_participants) vient de ce même appel ; la recherche de motifs
// (extraireNbParticipants) ne sert plus qu'en secours si le classement échoue.
// L'ancien champ niveau_fiabilite reste rempli par correspondance pendant la transition.
//
// API Batch (4 oct. 2026) : tous les appels Claude passent par l'API Message Batches,
// facturée 50 % moins cher, avec les MÊMES modèles et les MÊMES prompts qu'avant.
// Le run se déroule en 3 temps :
//   1. Recherche Europe PMC et vérifications en base pour tous les aliments du lot.
//   2. Vagues de tri Haiku puis d'analyse Sonnet (un lot par vague et par modèle) ;
//      chaque aliment s'arrête à son quota d'analyses ou de nouvelles études, comme avant.
//   3. Un lot Sonnet pour les niveaux de preuve des nouvelles études acceptées,
//      puis enregistrement dans Supabase.
// Quotas doublés (prix divisé par 2) et quotas renforcés pour les aliments à forte
// littérature (ALIMENTS_GROS_VOLUME).
// Le script attend la fin de chaque lot (en général quelques minutes à une heure).
// Les réponses illisibles sont renvoyées dans un nouveau lot (3 tentatives au total, comme avant).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Quotas par aliment et par run. Avec l'API Batch (prix divisé par 2), les quotas sont
// doublés par rapport à l'ancienne version (500 / 25 / 15) : le coût maximal par aliment
// reste au plus égal à l'ancien, et la veille est plus complète.
const RESULTATS_A_RECUPERER = parseInt(process.env.RESULTATS_A_RECUPERER || '1000', 10); // résultats Europe PMC lus (gratuit)
const MAX_ANALYSES_PAR_RUN = parseInt(process.env.MAX_ANALYSES_PAR_RUN || '50', 10); // analyses Sonnet
const MAX_NOUVELLES_ETUDES_PAR_RUN = parseInt(process.env.MAX_NOUVELLES_ETUDES_PAR_RUN || '30', 10); // nouvelles études acceptées
const TAILLE_PAGE_EUROPEPMC = 100;

// Quotas renforcés pour les aliments à très forte littérature (4 oct. 2026).
// Liste modifiable : ajouter ou retirer un slug suffit.
const QUOTAS_RENFORCES = { resultats: 2000, analyses: 100, nouvelles: 60 };
const ALIMENTS_GROS_VOLUME = [
  // Demandés par Bruno
  'curcuma-poudre',
  'sucre-blanc',
  'poisson',
  'sel-blanc-alimentaire-iode-non-fluore-marin-ignigene-ou-gemme',
  'soja-graine-entiere',
  'isolat-de-soja',
  // Ajoutés (littérature très abondante)
  'poisson-gras',
  'huile-de-saumon', // « Huile de poisson » (oméga-3)
  'cafe-moulu',
  'the-feuille',
  'oeuf-a-la-coque', // « Oeuf »
  'lait-ecreme-uht', // « Lait écrémé ou demi-écrémé »
  'lait-sans-precision-sur-la-teneur-en-matiere-grasse-uht-aliment-moyen', // « Lait »
  'legume-cuit-aliment-moyen', // « Légumes »
  'vin-aliment-moyen',
  'cereales-completes',
  'produits-laitiers',
];

function quotasPour(aliment) {
  if (ALIMENTS_GROS_VOLUME.includes(aliment.slug)) return QUOTAS_RENFORCES;
  return {
    resultats: RESULTATS_A_RECUPERER,
    analyses: MAX_ANALYSES_PAR_RUN,
    nouvelles: MAX_NOUVELLES_ETUDES_PAR_RUN,
  };
}

// Nombre maximal de vagues de tri/analyse par run (voir main).
const MAX_VAGUES = parseInt(process.env.MAX_VAGUES || '6', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const LIMITE = parseInt(process.env.LIMITE || '200', 10);
const JOURS_VEILLE = parseInt(process.env.JOURS_VEILLE || '10', 10);
// Attente maximale par lot Claude (en minutes). Un job GitHub Actions est limité à 6 h.
const ATTENTE_MAX_LOT_MIN = parseInt(process.env.ATTENTE_MAX_LOT_MIN || '120', 10);

const MODELE_TRI = 'claude-haiku-4-5-20251001';
const MODELE_ANALYSE = 'claude-sonnet-5';
const DELAI_MAX_MS = 60000; // délai maximal pour chaque appel réseau
const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const TAILLE_MAX_LOT_CLAUDE = 5000; // requêtes par lot envoyé (la limite de l'API est bien plus haute)
const INTERVALLE_SONDAGE_MS = 30000; // vérification de l'état d'un lot toutes les 30 s

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

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // 4 oct. 2026 : plus de filtre NOVA 4 (ni liste d'exceptions) : la colonne actif est le
  // seul interrupteur. Les fiches NOVA 4 non voulues sont désactivées en base.
  const eligibles = aliments
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
// (400, 414...) ne sont pas reprises en fin de recherche.
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
      await pause(delai);
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
      await pause(delai);
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

  const maxResultats = quotasPour(aliment).resultats;
  while (resultats.length < maxResultats) {
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
    await pause(300); // pause entre deux pages
  }

  return {
    resultats: resultats.slice(0, maxResultats),
    total,
  };
}

// ---------------------------------------------------------------------------
// API Message Batches
// ---------------------------------------------------------------------------

function entetesAnthropic() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

// Appel réseau vers l'API Anthropic avec nouvelles tentatives (erreurs réseau, 429, 5xx).
async function appelAnthropic(url, options, tentative = 1) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(DELAI_MAX_MS * 2) });
  } catch (e) {
    if (tentative < 5) {
      await pause(5000 * tentative);
      return appelAnthropic(url, options, tentative + 1);
    }
    throw new Error(`API Anthropic injoignable : ${e.message}`);
  }
  if (!res.ok) {
    if ([429, 500, 502, 503, 504, 529].includes(res.status) && tentative < 5) {
      await pause(5000 * tentative);
      return appelAnthropic(url, options, tentative + 1);
    }
    const texte = await res.text().catch(() => '');
    throw new Error(`API Anthropic erreur ${res.status} : ${texte.slice(0, 300)}`);
  }
  return res;
}

// Envoie une liste de requêtes { id, modele, maxTokens, prompt } en lot(s),
// attend la fin du traitement et renvoie une Map id -> { ok: true, texte } ou { ok: false, erreur }.
async function executerLotClaude(requetes, libelle) {
  const resultats = new Map();
  if (requetes.length === 0) return resultats;

  // 1. Envoi (découpé en sous-lots si besoin)
  const idsLots = [];
  for (let i = 0; i < requetes.length; i += TAILLE_MAX_LOT_CLAUDE) {
    const tranche = requetes.slice(i, i + TAILLE_MAX_LOT_CLAUDE);
    const res = await appelAnthropic(URL_BATCHES, {
      method: 'POST',
      headers: entetesAnthropic(),
      body: JSON.stringify({
        requests: tranche.map((r) => ({
          custom_id: r.id,
          params: {
            model: r.modele,
            max_tokens: r.maxTokens,
            messages: [{ role: 'user', content: r.prompt }],
          },
        })),
      }),
    });
    const lot = await res.json();
    idsLots.push(lot.id);
    console.log(`  [${libelle}] lot ${lot.id} envoyé (${tranche.length} requêtes).`);
  }

  // 2. Attente de la fin du traitement
  const debut = Date.now();
  const urlsResultats = new Map();
  while (urlsResultats.size < idsLots.length) {
    if (Date.now() - debut > ATTENTE_MAX_LOT_MIN * 60 * 1000) {
      throw new Error(`[${libelle}] lot non terminé après ${ATTENTE_MAX_LOT_MIN} min (lots : ${idsLots.join(', ')}).`);
    }
    await pause(INTERVALLE_SONDAGE_MS);
    for (const id of idsLots) {
      if (urlsResultats.has(id)) continue;
      const res = await appelAnthropic(`${URL_BATCHES}/${id}`, { method: 'GET', headers: entetesAnthropic() });
      const lot = await res.json();
      if (lot.processing_status === 'ended' && lot.results_url) {
        urlsResultats.set(id, lot.results_url);
        const c = lot.request_counts || {};
        console.log(`  [${libelle}] lot ${id} terminé en ${Math.round((Date.now() - debut) / 60000)} min (réussies : ${c.succeeded}, erreurs : ${c.errored}, expirées : ${c.expired}).`);
      }
    }
  }

  // 3. Lecture des résultats (fichier .jsonl, une ligne par requête, ordre non garanti)
  for (const url of urlsResultats.values()) {
    const res = await appelAnthropic(url, { method: 'GET', headers: entetesAnthropic() });
    const texte = await res.text();
    for (const ligne of texte.split('\n')) {
      if (!ligne.trim()) continue;
      let objet;
      try {
        objet = JSON.parse(ligne);
      } catch (e) {
        continue;
      }
      const r = objet.result || {};
      if (r.type === 'succeeded') {
        const contenu = (r.message?.content || []).map((b) => b.text || '').join('');
        resultats.set(objet.custom_id, { ok: true, texte: contenu });
      } else {
        const message = r.error?.error?.message || r.error?.message || r.type || 'inconnu';
        resultats.set(objet.custom_id, { ok: false, erreur: message });
      }
    }
  }

  return resultats;
}

// Envoie des requêtes en lot et interprète chaque réponse. Une réponse illisible ou en erreur
// est renvoyée dans un nouveau lot, jusqu'à 3 tentatives au total (comme les anciennes reprises).
// taches : [{ cle, modele, maxTokens, prompt }] ; interpreter(texte) renvoie l'objet ou lève une erreur.
// Renvoie une Map cle -> objet interprété (les échecs définitifs sont absents de la Map).
async function executerAvecReprises(taches, interpreter, libelle) {
  const interpretes = new Map();
  let restantes = taches;
  for (let tentative = 1; tentative <= 3 && restantes.length > 0; tentative++) {
    if (tentative > 1) console.log(`  [${libelle}] ${restantes.length} réponse(s) à refaire, tentative ${tentative}/3.`);
    const requetes = restantes.map((t) => ({
      id: `${t.cle}-t${tentative}`,
      modele: t.modele,
      maxTokens: t.maxTokens,
      prompt: t.prompt,
    }));
    const resultats = await executerLotClaude(requetes, `${libelle} ${tentative}/3`);
    const echecs = [];
    for (const t of restantes) {
      const r = resultats.get(`${t.cle}-t${tentative}`);
      if (r && r.ok) {
        try {
          interpretes.set(t.cle, interpreter(r.texte));
          continue;
        } catch (e) {
          t.derniereErreur = `réponse illisible : "${r.texte.slice(0, 120)}"`;
        }
      } else {
        t.derniereErreur = r ? r.erreur : 'résultat absent';
      }
      echecs.push(t);
    }
    restantes = echecs;
  }
  for (const t of restantes) {
    console.log(`  [${libelle}] échec définitif pour ${t.cle} : ${t.derniereErreur}`);
  }
  return interpretes;
}

function extraireJSON(texte) {
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  return { nettoye, objet: JSON.parse(match ? match[0] : nettoye) };
}

// ---------------------------------------------------------------------------
// Prompts (inchangés)
// ---------------------------------------------------------------------------

// Tri rapide par Haiku : n'écarte que les cas CLAIREMENT hors sujet.
// En cas de doute ou d'erreur, laisse passer (Sonnet tranchera).
// 28 sept. 2026 : ajout des catégories que Sonnet rejette systématiquement
// (contamination, technologie, enquêtes sans issue de santé, méthodes d'analyse),
// pour ne plus consommer le garde-fou d'analyses Sonnet sur ces études.
function promptTri(titreOriginal, abstractOriginal, nomAliment) {
  return `Tu fais un PREMIER TRI RAPIDE d'études scientifiques pour une fiche sur l'aliment : ${nomAliment}

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
- elle porte sur la formulation, la texture, la conservation, les propriétés physico-chimiques ou l'analyse sensorielle d'un produit, sans effet de santé mesuré chez des personnes ; ou c'est une revue consacrée surtout à la composition, la production, la transformation ou la valorisation de coproduits d'un aliment, qui ne cite des bienfaits pour la santé que de façon générale ;
- c'est une enquête sur les achats, les connaissances, les attitudes ou la fréquence de consommation, sans lien mesuré avec un effet de santé ;
- elle développe ou valide une méthode d'analyse, de dosage, de détection ou d'authentification.

Dans TOUS les autres cas, y compris en cas de doute, réponds "true" : une analyse plus fine sera faite ensuite.
Une étude chez l'humain qui ne trouve AUCUN effet ou AUCUNE association avec l'aliment est un résultat valable : réponds "true".

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après :
{"pertinent": true}
ou
{"pertinent": false, "raison": "une phrase courte en français"}`;
}

function interpreterTri(texte) {
  const { objet } = extraireJSON(texte);
  if (objet.pertinent === false) {
    return { pertinent: false, raison: objet.raison || 'hors sujet' };
  }
  return { pertinent: true };
}

function promptAnalyse(titreOriginal, abstractOriginal, nomAliment) {
  return `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
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
- L'étude porte sur un micro-organisme, une toxine, un contaminant ou un procédé industriel lié à l'aliment, sans aucun cas de maladie ni effet de santé observé chez des personnes (ex : la biosynthèse d'un champignon d'affinage, la prévalence d'une bactérie dans l'aliment, un procédé de fabrication).
- Il s'agit d'une épidémie ou d'une intoxication due à une défaillance ponctuelle de production ou d'hygiène (un lot, une usine, une cantine), qui n'apprend rien sur l'aliment lui-même.
- Il s'agit d'une revue portant surtout sur la composition, la production, la transformation, la conservation ou la valorisation de coproduits de l'aliment, ou sur un usage cosmétique, même si elle mentionne des « bienfaits pour la santé » sans synthétiser de résultats précis obtenus chez l'humain.
- L'aliment sert uniquement de repas témoin, de comparateur ou de véhicule pour tester autre chose (un médicament, un nutriment ajouté, un autre aliment), sans qu'un effet propre lui soit attribué.
- L'aliment n'est qu'un facteur parmi de nombreux autres (habitudes de vie, score combiné, questionnaire alimentaire global, liste d'allergènes) sans qu'un effet ou une association propre à cet aliment soit rapporté.
- L'étude porte sur un produit homonyme ou d'une autre origine que l'aliment de la fiche, même s'il partage le même mot : par exemple le lait maternel ou les préparations pour nourrissons pour une fiche de lait animal, le beurre de cacahuète pour une fiche de beurre.
- Il s'agit d'un article de méthode (mise au point d'instruments génétiques, de modèles statistiques, de questionnaires ou d'outils de mesure) dont l'objet n'est pas l'effet de l'aliment sur la santé.
- L'aliment n'est pas l'exposition principale de l'étude : étude portant sur l'alimentation ultra-transformée, l'alcool, la qualité ou un profil de l'alimentation, une catégorie plus large que cet aliment, ou recensant de nombreux facteurs de risque d'une maladie (y compris les analyses de fardeau de morbidité ou de fractions attribuables couvrant plusieurs risques alimentaires), même si un résultat chiffré pour cet aliment y figure parmi d'autres. Une telle étude n'est pertinente que si cet aliment est explicitement au centre de la question de recherche, par exemple nommé dans le titre ou dans l'objectif principal.
- Pour les allergies : une étude sur la tolérance, la désensibilisation, l'introduction ou la réintroduction de cet aliment chez des personnes allergiques EST pertinente, de même qu'une étude qui décrit des réactions allergiques à cet aliment chez des personnes (cas clinique, série de cas, épidémiologie de cette allergie) ; une étude qui recense seulement une sensibilisation parmi de nombreux allergènes, ou qui porte uniquement sur les conséquences de l'éviction de l'aliment, ne l'est pas.
- Il s'agit d'un éditorial, d'un commentaire, d'une lettre ou d'un protocole d'étude sans résultats.
- Tout autre sujet hors nutrition/santé humaine.
Ne réponds "true" que si un effet ou bénéfice a été concrètement évalué chez des sujets humains suite à une consommation alimentaire (essai clinique, cohorte, méta-analyse de données humaines), OU si l'étude documente chez l'humain un effet néfaste lié à l'aliment : infection ou intoxication liée à la nature de l'aliment ou à son mode de consommation courant (cru, non pasteurisé, préparation traditionnelle, espèce ou population à risque), effet indésirable de l'aliment ou d'un produit qui en est issu (y compris un complément alimentaire), ou réaction allergique à cet aliment.
 
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
}

function interpreterAnalyse(texte) {
  const objet = extraireJSON(texte).objet;
  if (typeof objet.pertinent !== 'boolean') throw new Error('champ pertinent absent');
  return objet;
}

// Niveau de preuve selon l'échelle d'Oxford (CEBM 2011), étude par étude,
// pour la question « cet aliment a-t-il cet effet ? ». Évalué à partir du titre
// et du résumé uniquement.
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
  'Revue mécanistique',
  'Autre',
];

function promptClassement(titre, resumeOriginal) {
  return `Tu es un méthodologiste en médecine fondée sur les preuves. Classe l'étude ci-dessous selon l'échelle des niveaux de preuve d'Oxford (CEBM 2011), pour la question « cet aliment ou ce composé alimentaire a-t-il cet effet sur la santé ? ». Base-toi uniquement sur le titre et le résumé.

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
- Niveau 5 : revue narrative (synthèse non systématique, centrée sur des résultats obtenus chez l'humain), revue mécanistique (centrée sur des mécanismes biologiques étudiés surtout sur des cellules ou chez l'animal) ou raisonnement mécanistique. Choisis « Revue mécanistique » plutôt que « Revue narrative » quand l'essentiel de la revue porte sur ces mécanismes.

3. Donne l'effectif TOTAL de personnes incluses dans l'étude (nombre entier), tel qu'indiqué dans le résumé.
- Pour une méta-analyse ou une revue systématique : le nombre total de participants des études incluses, s'il est indiqué ; sinon null.
- Pour une revue narrative ou une étude sans participants : null.
- Ne confonds pas avec une durée, un âge, un nombre d'études ou un pourcentage. Si l'effectif n'est pas clairement indiqué : null.

4. Signale un éventuel défaut majeur, visible dans le résumé, parmi :
- "sans_temoin" : un ESSAI qui n'a ni groupe témoin ni placebo alors qu'il en faudrait un ;
- "imprecision" : résultats explicitement très imprécis ou incohérents (par exemple une forte hétérogénéité non expliquée dans une méta-analyse) ;
- "aucun" : dans tous les autres cas, et en cas de doute.
Ne signale PAS la taille de l'effectif ici (elle est traitée à part), ni le fait que le produit soit un extrait, un complément ou un mélange, ni un résultat négatif ou non significatif : l'absence d'effet est un résultat valable, pas un défaut.

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"design": "libellé exact de la liste", "niveau_base": 2, "participants": 120, "defaut": "aucun", "motif": "", "releve": false}
ou, en cas de défaut :
{"design": "Méta-analyse d'essais randomisés", "niveau_base": 1, "participants": 850, "defaut": "imprecision", "motif": "forte hétérogénéité entre les essais", "releve": false}`;
}

// Renvoie { niveau (1-5), design, ajustement, participants } ou lève une erreur.
function interpreterClassement(texte) {
  const ESSAIS = ['Essai randomisé contrôlé', 'Essai croisé randomisé', 'Essai non randomisé'];
  const { objet } = extraireJSON(texte);
  const base = parseInt(objet.niveau_base, 10);
  if (!(base >= 1 && base <= 5)) throw new Error('Niveau de base invalide');
  const design = DESIGNS_AUTORISES.includes(objet.design) ? objet.design : 'Autre';
  const n = parseInt(objet.participants, 10);
  const participants = Number.isInteger(n) && n > 0 && n < 50000000 ? n : null;
  const motifModele = typeof objet.motif === 'string' ? objet.motif.trim() : '';

  // Les règles d'ajustement sont appliquées ici, de façon mécanique, et non par le modèle.
  let sens = 0;
  let motif = '';
  if (ESSAIS.includes(design) && participants !== null && participants < 30) {
    sens = 1;
    motif = `essai de ${participants} participants`;
  } else if (objet.defaut === 'sans_temoin' && ESSAIS.includes(design)) {
    sens = 1;
    motif = motifModele || 'sans groupe témoin ni placebo';
  } else if (objet.defaut === 'imprecision') {
    sens = 1;
    motif = motifModele || 'résultats imprécis ou incohérents';
  } else if (objet.releve === true) {
    sens = -1;
    motif = motifModele || 'effet très important';
  }

  const niveau = Math.min(5, Math.max(1, base + sens));
  const ajustement = niveau === base ? null : `${sens === 1 ? 'Abaissé' : 'Relevé'} : ${motif}`;
  return { niveau, design, ajustement, participants };
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

// ---------------------------------------------------------------------------
// Phase 1 : collecte des candidats d'un aliment (Europe PMC + vérifications en base)
// ---------------------------------------------------------------------------

async function collecterCandidats(aliment) {
  console.log(`\n=== ${aliment.slug} ===`);

  const { resultats, total } = await chercherEtudesEuropePMC(aliment);
  console.log(`  ${total} résultats au total sur Europe PMC, ${resultats.length} examinés${total > resultats.length ? ' ⚠️ DÉBORDEMENT' : ''}.`);
  await pause(300); // pause pour éviter de saturer Europe PMC

  // Déduplication défensive : Europe PMC peut renvoyer le même article deux fois.
  const dejaVusDansCeLot = new Set();
  const resultatsUniques = resultats.filter((etude) => {
    const sourceId = etude.id || etude.pmid;
    if (!sourceId || dejaVusDansCeLot.has(sourceId)) return false;
    dejaVusDansCeLot.add(sourceId);
    return true;
  });

  const candidats = [];

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

      if (lienExistant) continue; // déjà en base et déjà liée
    }

    const { data: dejaRejete } = await supabase
      .from('candidats_rejetes')
      .select('source_id')
      .eq('aliment_id', aliment.id)
      .eq('source_id', sourceId)
      .maybeSingle();

    if (dejaRejete) continue; // déjà rejeté précédemment pour cet aliment

    if (!etude.abstractText) continue; // pas de résumé disponible

    candidats.push({
      aliment,
      sourceId,
      etude,
      existantId: existant ? existant.id : null,
    });
  }

  console.log(`  ${candidats.length} candidat(s) à trier.`);
  return candidats;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Paramètres de ce run : OFFSET=${OFFSET}, LIMITE=${LIMITE}, JOURS_VEILLE=${JOURS_VEILLE}, RESULTATS_A_RECUPERER=${RESULTATS_A_RECUPERER}, MAX_NOUVELLES=${MAX_NOUVELLES_ETUDES_PAR_RUN}, MAX_ANALYSES=${MAX_ANALYSES_PAR_RUN}, MAX_VAGUES=${MAX_VAGUES}, aliments à quotas renforcés : ${ALIMENTS_GROS_VOLUME.length}`);
  const tousLesAliments = await recupererAlimentsATraiter();
  const lot = tousLesAliments.slice(OFFSET, OFFSET + LIMITE);
  console.log(`${tousLesAliments.length} aliments éligibles au total. Lot traité : offset ${OFFSET}, ${lot.length} aliments (jusqu'à l'offset ${OFFSET + lot.length}).`);

  // ===== Phase 1 : recherche Europe PMC =====
  console.log('\n##### Recherche Europe PMC #####');
  const candidats = [];
  let enEchec = [];
  const echecsDefinitifs = [];

  for (const aliment of lot) {
    try {
      candidats.push(...(await collecterCandidats(aliment)));
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
      if (e.temporaire === false) {
        echecsDefinitifs.push({ aliment, message: e.message });
      } else {
        enEchec.push({ aliment, message: e.message });
      }
    }
  }

  // Reprises après une pause, pour laisser à Europe PMC le temps de revenir.
  const PAUSES_REPRISE_MIN = [5, 15];
  for (let passe = 0; passe < PAUSES_REPRISE_MIN.length && enEchec.length > 0; passe++) {
    const duree = PAUSES_REPRISE_MIN[passe];
    console.log(`\n${enEchec.length} aliment(s) en échec. Reprise ${passe + 1}/${PAUSES_REPRISE_MIN.length} dans ${duree} min : ${enEchec.map((x) => x.aliment.slug).join(', ')}`);
    await pause(duree * 60 * 1000);

    const encoreEnEchec = [];
    for (const { aliment } of enEchec) {
      try {
        candidats.push(...(await collecterCandidats(aliment)));
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

  // Numérotation des candidats (sert d'identifiant dans les lots Claude).
  candidats.forEach((c, i) => {
    c.cle = `c${i}`;
  });
  console.log(`\n${candidats.length} candidat(s) au total, avant tri.`);

  // ===== Phases 2 et 3 : tri Haiku puis analyse Sonnet, par vagues =====
  // Comme l'ancien script, chaque aliment est traité dans l'ordre de pertinence Europe PMC
  // et s'arrête dès qu'il atteint son quota d'analyses Sonnet ou de nouvelles études.
  // Pour ne pas trier avec Haiku plus d'études que nécessaire, le tri se fait par vagues :
  // à chaque vague, on ne trie que le nombre d'études estimé pour remplir le quota restant
  // (d'après la proportion d'études retenues par Haiku lors des vagues précédentes).
  const etats = new Map(); // aliment.id -> état de l'aliment
  for (const c of candidats) {
    if (!etats.has(c.aliment.id)) {
      etats.set(c.aliment.id, {
        aliment: c.aliment,
        quotas: quotasPour(c.aliment),
        file: [],
        position: 0,
        tries: 0,
        retenusHaiku: 0,
        analyses: 0,
        nouvelles: 0,
        termine: false,
      });
    }
    etats.get(c.aliment.id).file.push(c);
  }

  const nouvellesAcceptees = []; // { c, analyse }
  let totalTries = 0;
  let rejetsHaiku = 0;
  let totalAnalyses = 0;
  let rejetsSonnet = 0;
  let liaisons = 0;

  for (let vague = 1; vague <= MAX_VAGUES; vague++) {
    // Sélection des études à trier dans cette vague
    const aTrier = [];
    for (const e of etats.values()) {
      const restantes = e.quotas.analyses - e.analyses;
      if (e.termine || restantes <= 0 || e.position >= e.file.length) {
        e.termine = true;
        continue;
      }
      const proportion = e.tries > 0 ? Math.max(e.retenusHaiku / e.tries, 0.1) : 0.5;
      const n = Math.min(e.file.length - e.position, Math.ceil(restantes / proportion));
      const selection = e.file.slice(e.position, e.position + n);
      e.position += n;
      e.vague = selection;
      aTrier.push(...selection);
    }
    if (aTrier.length === 0) break;

    console.log(`\n##### Vague ${vague} : tri Haiku de ${aTrier.length} étude(s) #####`);
    const tris = await executerAvecReprises(
      aTrier.map((c) => ({
        cle: `tri-${c.cle}`,
        modele: MODELE_TRI,
        maxTokens: 200,
        prompt: promptTri(c.etude.title, c.etude.abstractText, c.aliment.nom),
      })),
      interpreterTri,
      `Tri Haiku v${vague}`
    );
    totalTries += aTrier.length;

    // Résultats du tri et choix des études à analyser (dans l'ordre, sans dépasser le quota)
    const aAnalyser = [];
    for (const e of etats.values()) {
      if (!e.vague || e.vague.length === 0) continue;
      const restantes = e.quotas.analyses - e.analyses;
      for (const c of e.vague) {
        e.tries++;
        const tri = tris.get(`tri-${c.cle}`);
        // En cas d'échec du tri, on laisse passer (Sonnet tranchera), comme avant.
        if (tri && tri.pertinent === false) {
          rejetsHaiku++;
          await enregistrerRejet(c.aliment.id, c.sourceId, c.etude.title, `[Haiku] ${tri.raison}`);
          continue;
        }
        e.retenusHaiku++;
        if (e.analysesVague === undefined) e.analysesVague = [];
        if (e.analysesVague.length < restantes) e.analysesVague.push(c);
      }
      aAnalyser.push(...(e.analysesVague || []));
    }

    if (aAnalyser.length > 0) {
      console.log(`\n##### Vague ${vague} : analyse Sonnet de ${aAnalyser.length} étude(s) #####`);
      const analyses = await executerAvecReprises(
        aAnalyser.map((c) => ({
          cle: `ana-${c.cle}`,
          modele: MODELE_ANALYSE,
          maxTokens: 3000,
          prompt: promptAnalyse(c.etude.title, c.etude.abstractText, c.aliment.nom),
        })),
        interpreterAnalyse,
        `Analyse Sonnet v${vague}`
      );
      totalAnalyses += aAnalyser.length;

      // Décisions, aliment par aliment, dans l'ordre Europe PMC.
      for (const e of etats.values()) {
        for (const c of e.analysesVague || []) {
          e.analyses++;
          const analyse = analyses.get(`ana-${c.cle}`);
          if (!analyse) {
            console.log(`  - Analyse impossible (${c.aliment.slug}, ${c.sourceId}), on passe.`);
            continue;
          }
          if (!analyse.pertinent) {
            rejetsSonnet++;
            await enregistrerRejet(c.aliment.id, c.sourceId, c.etude.title, analyse.raison);
            continue;
          }
          // Étude déjà en base pour un autre aliment : on la relie seulement
          // (les résumés existants ne sont pas modifiés).
          if (c.existantId) {
            await supabase.from('aliments_etudes').insert({
              aliment_id: c.aliment.id,
              etude_id: c.existantId,
            });
            liaisons++;
            console.log(`  - ${c.aliment.slug} : déjà en base (${c.sourceId}), jugée pertinente et reliée.`);
            continue;
          }
          // Quota de nouvelles études déjà atteint dans cette vague : l'étude reste non enregistrée.
          if (e.nouvelles >= e.quotas.nouvelles) continue;
          nouvellesAcceptees.push({ c, analyse });
          e.nouvelles++;
          if (e.nouvelles >= e.quotas.nouvelles) {
            e.termine = true;
            console.log(`  - ${e.aliment.slug} : quota de ${e.quotas.nouvelles} nouvelles études atteint.`);
          }
        }
      }
    }

    // Remise à zéro des sélections de la vague
    for (const e of etats.values()) {
      e.vague = [];
      e.analysesVague = [];
      if (!e.termine && e.analyses >= e.quotas.analyses) {
        e.termine = true;
        console.log(`  - ${e.aliment.slug} : quota de ${e.quotas.analyses} analyses Sonnet atteint.`);
      }
    }
  }

  const inacheves = [...etats.values()].filter((e) => !e.termine && e.position < e.file.length);
  if (inacheves.length > 0) {
    console.log(`\n⚠️ Nombre maximal de vagues (${MAX_VAGUES}) atteint, études non examinées pour : ${inacheves.map((e) => e.aliment.slug).join(', ')}`);
  }
  console.log(`\n${totalTries} étude(s) triée(s) par Haiku (${rejetsHaiku} écartée(s)), ${totalAnalyses} analysée(s) par Sonnet (${rejetsSonnet} écartée(s)), ${liaisons} liaison(s), ${nouvellesAcceptees.length} nouvelle(s) étude(s) acceptée(s).`);

  // ===== Niveau de preuve (un lot, une requête par étude) puis enregistrement =====
  console.log('\n##### Niveau de preuve et enregistrement #####');
  const etudesAClasser = new Map(); // sourceId -> candidat (une seule requête par étude)
  for (const { c } of nouvellesAcceptees) {
    if (!etudesAClasser.has(c.sourceId)) etudesAClasser.set(c.sourceId, c);
  }
  const classements = await executerAvecReprises(
    [...etudesAClasser.values()].map((c) => ({
      cle: `pre-${c.cle}`,
      modele: MODELE_ANALYSE,
      maxTokens: 1500,
      prompt: promptClassement(c.etude.title, c.etude.abstractText),
    })),
    interpreterClassement,
    'Niveau de preuve'
  );

  let ajoutees = 0;
  for (const { c, analyse } of nouvellesAcceptees) {
    const { etude, sourceId, aliment } = c;
    try {
      const premier = etudesAClasser.get(sourceId);
      const preuve = classements.get(`pre-${premier.cle}`) || null;
      const niveauFiabilite = niveauFiabiliteDepuisPreuve(preuve?.niveau);

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
          // Effectif lu par le modèle ; la recherche de motifs ne sert qu'en secours si le classement a échoué.
          nb_participants: preuve ? preuve.participants : extraireNbParticipants(etude.abstractText),
        })
        .select('id')
        .single();

      if (erreurInsert) {
        if (erreurInsert.code === '23505') {
          // Déjà insérée (par exemple pour un autre aliment de ce même run) : on la relie.
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

      if (lienExistant) continue;

      await supabase.from('aliments_etudes').insert({
        aliment_id: aliment.id,
        etude_id: etudeId,
      });

      ajoutees++;
      const etiquettePreuve = preuve
        ? `Niveau ${preuve.niveau} — ${preuve.design}${preuve.ajustement ? ` (${preuve.ajustement})` : ''}${preuve.participants ? `, n=${preuve.participants}` : ''}`
        : 'niveau inconnu';
      console.log(`  - ${aliment.slug} : ajoutée (${etiquettePreuve}) : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }

  // ===== Bilan =====
  console.log('\n##### Bilan #####');
  console.log(`Triés Haiku : ${totalTries} | écartés Haiku : ${rejetsHaiku} | analysés Sonnet : ${totalAnalyses} | écartés Sonnet : ${rejetsSonnet} | liaisons : ${liaisons} | nouvelles études ajoutées : ${ajoutees}`);

  if (tousLesEchecs.length > 0) {
    console.log(`\n⚠️ ${tousLesEchecs.length} aliment(s) toujours en échec de recherche. À relancer via slugs_cibles :`);
    console.log(tousLesEchecs.map((x) => x.aliment.slug).join(','));
  } else {
    console.log('\nAucun aliment en échec de recherche.');
  }
  console.log('\nTerminé.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});

 
