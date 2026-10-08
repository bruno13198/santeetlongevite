// Script d'automatisation : récupère des études sur Europe PMC pour les habitudes
// alimentaires (régimes, patterns), les trie, génère 2 résumés en français via l'API Claude,
// classe leur niveau de preuve, et enregistre tout dans Supabase.
//
// Recherche : MeSH (si est_terme_mesh) OU termes en texte libre (termes_texte),
// cherchés dans le titre et le résumé. Le texte libre est indispensable : les
// articles récents n'ont pas encore de tag MeSH ni de type de publication
// (méta-analyse, essai...) au moment où ils entrent dans Europe PMC.
// Fenêtre sur FIRST_IDATE (date d'entrée dans Europe PMC). Les titres signalant
// clairement un sujet animal/végétal/matériau sont exclus dès la requête (même liste
// que pour les aliments). Requête envoyée en POST (searchPOST), toutes les pages lues.
//
// Refonte du 4 oct. 2026, alignée sur import-etudes.js :
//   - tri rapide Haiku avant l'analyse Sonnet (n'écarte que les cas CLAIREMENT hors sujet) ;
//   - analyse Sonnet avec le prompt « habitudes » inchangé ;
//   - niveau de preuve selon l'échelle d'Oxford (CEBM 2011), comme pour les aliments
//     (remplace l'ancien classement haute/moderee/preliminaire, conservé par correspondance) ;
//   - API Message Batches (50 % moins cher), traitement par vagues, quotas doublés et
//     quotas renforcés pour les habitudes à forte littérature (HABITUDES_GROS_VOLUME).
// Une étude déjà en base (acceptée pour un autre sujet) passe par le même tri
// avant d'être reliée à cette habitude.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Quotas par habitude et par run. Avec l'API Batch (prix divisé par 2), les quotas sont
// doublés par rapport à l'ancienne version (100 / 40 / 25).
const RESULTATS_A_RECUPERER = parseInt(process.env.RESULTATS_A_RECUPERER || '200', 10); // résultats Europe PMC lus (gratuit)
const MAX_ANALYSES_PAR_RUN = parseInt(process.env.MAX_ANALYSES_PAR_RUN || '80', 10); // analyses Sonnet
const MAX_NOUVELLES_ETUDES_PAR_RUN = parseInt(process.env.MAX_NOUVELLES_ETUDES_PAR_RUN || '50', 10); // nouvelles études acceptées
const TAILLE_PAGE_EUROPEPMC = 100;

// Quotas renforcés pour les habitudes à très forte littérature (4 oct. 2026).
// Liste modifiable : ajouter ou retirer un slug suffit.
const QUOTAS_RENFORCES = { resultats: 400, analyses: 160, nouvelles: 100 };
const HABITUDES_GROS_VOLUME = [
  'regime-mediterraneen',
  'alimentation-saine',
  'jeune-intermittent',
  'restriction-calorique',
  'regime-cetogene',
  'aliments-ultra-transformes',
  'consommation-alcool',
];

function quotasPour(habitude) {
  if (HABITUDES_GROS_VOLUME.includes(habitude.slug)) return QUOTAS_RENFORCES;
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

// Construit la partie « sujet » de la requête Europe PMC :
// MeSH (ou mots-clés hérités si pas de MeSH) OU chacun des termes en texte libre.
function construireFiltreSujet(habitude) {
  const parties = [];

  if (habitude.terme_recherche && habitude.terme_recherche.trim() !== '') {
    if (habitude.est_terme_mesh) {
      parties.push(`(MESH:"${habitude.terme_recherche}")`);
    } else {
      const motsClefs = habitude.terme_recherche
        .split(' ')
        .map((mot) => `(TITLE:"${mot}" OR ABSTRACT:"${mot}")`)
        .join(' AND ');
      parties.push(`(${motsClefs})`);
    }
  }

  if (Array.isArray(habitude.termes_texte)) {
    for (const terme of habitude.termes_texte) {
      if (terme && terme.trim() !== '') {
        parties.push(`(TITLE:"${terme}" OR ABSTRACT:"${terme}")`);
      }
    }
  }

  return parties.join(' OR ');
}

async function recupererHabitudesATraiter() {
  const { data: habitudes, error } = await supabase
    .from('habitudes_alimentaires')
    .select('id, slug, nom, terme_recherche, est_terme_mesh, termes_texte')
    .eq('actif', true)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération habitudes: ${error.message}`);
  }

  const eligibles = habitudes.filter((h) => construireFiltreSujet(h) !== '');

  const slugsCibles = process.env.SLUGS_CIBLES;
  if (slugsCibles) {
    const listeSlugs = slugsCibles.split(',').map((s) => s.trim());
    return eligibles.filter((h) => listeSlugs.includes(h.slug));
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

async function chercherEtudesEuropePMC(habitude) {
  const motsClefs = construireFiltreSujet(habitude);

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

  const maxResultats = quotasPour(habitude).resultats;
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
// Version « habitudes » (4 oct. 2026), calquée sur les rejets systématiques de Sonnet.
function promptTri(titreOriginal, abstractOriginal, nomHabitude) {
  return `Tu fais un PREMIER TRI RAPIDE d'études scientifiques pour une fiche sur l'habitude alimentaire (régime, pratique ou pattern alimentaire) : ${nomHabitude}

Titre : ${titreOriginal}
Résumé : ${abstractOriginal}

Réponds "false" UNIQUEMENT si l'étude est CLAIREMENT dans l'un de ces cas :
- elle porte uniquement sur des animaux, des cellules, des tissus isolés ou des modèles in vitro/in silico, sans aucun sujet humain ;
- le terme de recherche est un homonyme ou une confusion (autre sens du mot : technique chirurgicale ou nom de lieu sans rapport avec l'alimentation, alimentation d'animaux ou d'espèces anciennes étudiée en archéologie ou en biologie, jeûne imposé avant une intervention médicale ou utilisé comme test diagnostique...) ;
- l'habitude alimentaire n'a aucun rapport réel avec le sujet de l'étude (absente, ou mentionnée seulement en passant) ;
- l'étude porte sur l'élevage, l'alimentation animale, l'agronomie ou un procédé industriel ;
- il s'agit d'un protocole sans résultats, d'une notice de rétractation, d'un éditorial, d'un commentaire ou d'une lettre ;
- elle développe ou valide une méthode d'analyse, un questionnaire ou un outil de mesure ;
- cette habitude n'est qu'un facteur parmi d'autres (score de mode de vie, plusieurs régimes ou comportements étudiés ensemble), ou seulement le cadre commun à tous les groupes d'un essai qui teste en réalité autre chose (un complément, un aliment, un médicament) ;
- Il s'agit d'un article de méthode (mise au point d'instruments génétiques, de modèles statistiques, de questionnaires ou d'outils de mesure) dont l'objet n'est pas l'effet de cette habitude sur la santé.
- elle porte uniquement sur les déterminants, les connaissances, les perceptions, les obstacles ou l'adhésion à cette habitude, sans mesurer de résultat de santé ;
- elle porte sur la composition, l'étiquetage ou la contamination des aliments, sans effet de santé mesuré chez des personnes.

Dans TOUS les autres cas, y compris en cas de doute, réponds "true" : une analyse plus fine sera faite ensuite.
Une étude chez l'humain qui ne trouve AUCUN effet ou AUCUNE association avec cette habitude est un résultat valable : réponds "true".

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

function promptAnalyse(titreOriginal, abstractOriginal, nomHabitude) {
  return `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
Cette étude a été trouvée en recherchant des publications sur l'habitude alimentaire suivante : ${nomHabitude}
 
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
 
Étape 1 — Vérifie le SUJET :
L'étude teste-t-elle vraiment et spécifiquement ce régime/pattern alimentaire (« ${nomHabitude} »), pas juste une mention en passant ou une comparaison lointaine ? Si l'étude porte sur un sujet différent qui a seulement été indexé sous ce terme par erreur ou de façon marginale, réponds "false".
 
Étape 2 — Évalue la pertinence humaine :
Cette étude mesure-t-elle un EFFET, un BÉNÉFICE ou une ASSOCIATION (sur la santé, une maladie, un marqueur biologique...) directement chez des sujets HUMAINS suivant ce régime ou y adhérant plus ou moins, ou via une méta-analyse/revue qui synthétise de tels résultats humains ?
Les études observationnelles (cohortes prospectives, études cas-témoins) mesurant l'adhésion à ce régime et son association avec la santé SONT pertinentes, au même titre que les essais cliniques et les méta-analyses.
Un résultat de santé désigne : une maladie ou son risque, des symptômes, un marqueur biologique, la mortalité, le poids ou la composition corporelle, la fonction cognitive ou la santé mentale, les performances cognitives ou scolaires.
Réponds "false" dans les cas suivants :
- L'étude porte uniquement sur des animaux ou des cellules en laboratoire, sans effet mesuré chez l'humain.
- L'étude décrit seulement la composition du régime, sans mesurer d'effet ou d'association de santé concret chez l'humain. Exception : une revue narrative ou mécanistique consacrée à cette habitude et à ses effets sur la santé (y compris si elle s'appuie surtout sur des données animales ou cellulaires) EST pertinente ; elle sera classée à part, au niveau de preuve le plus bas.
- Le critère étudié est l'adhésion au régime elle-même (niveau d'adhésion, ses déterminants, préférences, connaissances, ou efficacité d'une intervention pour faire adopter le régime), sans résultat de santé mesuré en lien avec ce régime.
- L'étude valide un outil de mesure, un questionnaire ou une méthode d'évaluation alimentaire.
- Le régime n'est qu'une variable d'ajustement, un indice parmi plusieurs autres, ou une composante d'une intervention multiple dont l'effet propre n'est pas isolé.
- Cette habitude n'est pas l'exposition principale de l'étude : étude sur de nombreux comportements ou facteurs de mode de vie (sommeil, tabac, activité physique, écrans...) ou sur plusieurs habitudes alimentaires à la fois, où celle-ci n'est qu'un élément parmi d'autres, même si une association chiffrée la concernant est rapportée. Elle n'est pertinente que si cette habitude est explicitement au centre de la question de recherche, par exemple nommée dans le titre ou dans l'objectif principal.
- Il s'agit d'un consensus d'experts (Delphi), d'une étude de perceptions ou d'opinions, d'un éditorial, d'un commentaire, d'une lettre ou d'un protocole d'étude sans résultats.
- Tout autre sujet hors nutrition/santé humaine.
 
Étape 3 — Si et seulement si pertinente sur les deux points ci-dessus, rédige les résumés en français.
 
Réponds UNIQUEMENT avec un objet JSON valide (rien avant, rien après), au format EXACT suivant. N'utilise JAMAIS de guillemets doubles (") à l'intérieur des textes — utilise des guillemets français « » ou des apostrophes si besoin. N'utilise JAMAIS de retour à la ligne à l'intérieur des valeurs texte.
 
Si l'étude N'EST PAS pertinente :
{
  "pertinent": false,
  "raison": "courte explication en français (une phrase)"
}
 
Si l'étude EST pertinente :
{
  "pertinent": true,
  "titre_traduit": "traduction française naturelle du titre",
  "resume_simplifie": "un résumé très simple et accessible en français (80-120 mots), sans jargon",
  "resume_reformule": "une reformulation plus détaillée en français (100-150 mots), qui garde davantage de nuance scientifique"
}
 
Règles importantes :
- Ne jamais transformer une corrélation en causalité si l'étude ne le permet pas (en particulier pour les études observationnelles)
- Rester factuel, ne pas exagérer les conclusions
- Varier le style et la structure des phrases
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

async function enregistrerRejet(habitudeId, sourceId, titre, raison) {
  await supabase.from('candidats_rejetes_habitudes').insert({
    habitude_id: habitudeId,
    source_id: sourceId,
    titre_original: titre,
    raison: raison,
  });
}

// ---------------------------------------------------------------------------
// Phase 1 : collecte des candidats d'une habitude (Europe PMC + vérifications en base)
// ---------------------------------------------------------------------------

async function collecterCandidats(habitude) {
  console.log(`\n=== ${habitude.slug} ===`);

  const { resultats, total } = await chercherEtudesEuropePMC(habitude);
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
        .from('habitudes_etudes')
        .select('habitude_id')
        .eq('habitude_id', habitude.id)
        .eq('etude_id', existant.id)
        .maybeSingle();

      if (lienExistant) continue; // déjà en base et déjà liée
    }

    const { data: dejaRejete } = await supabase
      .from('candidats_rejetes_habitudes')
      .select('source_id')
      .eq('habitude_id', habitude.id)
      .eq('source_id', sourceId)
      .maybeSingle();

    if (dejaRejete) continue; // déjà rejeté précédemment pour cette habitude

    if (!etude.abstractText) continue; // pas de résumé disponible

    candidats.push({
      habitude,
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
  console.log(`Paramètres de ce run : OFFSET=${OFFSET}, LIMITE=${LIMITE}, JOURS_VEILLE=${JOURS_VEILLE}, RESULTATS_A_RECUPERER=${RESULTATS_A_RECUPERER}, MAX_NOUVELLES=${MAX_NOUVELLES_ETUDES_PAR_RUN}, MAX_ANALYSES=${MAX_ANALYSES_PAR_RUN}, MAX_VAGUES=${MAX_VAGUES}, habitudes à quotas renforcés : ${HABITUDES_GROS_VOLUME.length}`);
  const toutesLesHabitudes = await recupererHabitudesATraiter();
  const lot = toutesLesHabitudes.slice(OFFSET, OFFSET + LIMITE);
  console.log(`${toutesLesHabitudes.length} habitudes éligibles au total. Lot traité : offset ${OFFSET}, ${lot.length} habitudes (jusqu'à l'offset ${OFFSET + lot.length}).`);

  // ===== Phase 1 : recherche Europe PMC =====
  console.log('\n##### Recherche Europe PMC #####');
  const candidats = [];
  let enEchec = [];
  const echecsDefinitifs = [];

  for (const habitude of lot) {
    try {
      candidats.push(...(await collecterCandidats(habitude)));
    } catch (e) {
      console.log(`Erreur générale sur ${habitude.slug}:`, e.message);
      if (e.temporaire === false) {
        echecsDefinitifs.push({ habitude, message: e.message });
      } else {
        enEchec.push({ habitude, message: e.message });
      }
    }
  }

  // Reprises après une pause, pour laisser à Europe PMC le temps de revenir.
  const PAUSES_REPRISE_MIN = [5, 15];
  for (let passe = 0; passe < PAUSES_REPRISE_MIN.length && enEchec.length > 0; passe++) {
    const duree = PAUSES_REPRISE_MIN[passe];
    console.log(`\n${enEchec.length} habitude(s) en échec. Reprise ${passe + 1}/${PAUSES_REPRISE_MIN.length} dans ${duree} min : ${enEchec.map((x) => x.habitude.slug).join(', ')}`);
    await pause(duree * 60 * 1000);

    const encoreEnEchec = [];
    for (const { habitude } of enEchec) {
      try {
        candidats.push(...(await collecterCandidats(habitude)));
      } catch (e) {
        console.log(`Erreur générale (reprise ${passe + 1}) sur ${habitude.slug}:`, e.message);
        if (e.temporaire === false) {
          echecsDefinitifs.push({ habitude, message: e.message });
        } else {
          encoreEnEchec.push({ habitude, message: e.message });
        }
      }
    }
    enEchec = encoreEnEchec;
  }

  // Seuls les échecs définitifs (ou persistants après reprises) sont enregistrés.
  const tousLesEchecs = [...echecsDefinitifs, ...enEchec];
  for (const { habitude, message } of tousLesEchecs) {
    await supabase.from('erreurs_import').insert({
      aliment_slug: habitude.slug,
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
  // Comme l'ancien script, chaque habitude est traité dans l'ordre de pertinence Europe PMC
  // et s'arrête dès qu'il atteint son quota d'analyses Sonnet ou de nouvelles études.
  // Pour ne pas trier avec Haiku plus d'études que nécessaire, le tri se fait par vagues :
  // à chaque vague, on ne trie que le nombre d'études estimé pour remplir le quota restant
  // (d'après la proportion d'études retenues par Haiku lors des vagues précédentes).
  const etats = new Map(); // habitude.id -> état de l'habitude
  for (const c of candidats) {
    if (!etats.has(c.habitude.id)) {
      etats.set(c.habitude.id, {
        habitude: c.habitude,
        quotas: quotasPour(c.habitude),
        file: [],
        position: 0,
        tries: 0,
        retenusHaiku: 0,
        analyses: 0,
        nouvelles: 0,
        termine: false,
      });
    }
    etats.get(c.habitude.id).file.push(c);
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
        prompt: promptTri(c.etude.title, c.etude.abstractText, c.habitude.nom),
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
          await enregistrerRejet(c.habitude.id, c.sourceId, c.etude.title, `[Haiku] ${tri.raison}`);
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
          maxTokens: 1500,
          prompt: promptAnalyse(c.etude.title, c.etude.abstractText, c.habitude.nom),
        })),
        interpreterAnalyse,
        `Analyse Sonnet v${vague}`
      );
      totalAnalyses += aAnalyser.length;

      // Décisions, habitude par habitude, dans l'ordre Europe PMC.
      for (const e of etats.values()) {
        for (const c of e.analysesVague || []) {
          e.analyses++;
          const analyse = analyses.get(`ana-${c.cle}`);
          if (!analyse) {
            console.log(`  - Analyse impossible (${c.habitude.slug}, ${c.sourceId}), on passe.`);
            continue;
          }
          if (!analyse.pertinent) {
            rejetsSonnet++;
            await enregistrerRejet(c.habitude.id, c.sourceId, c.etude.title, analyse.raison);
            continue;
          }
          // Étude déjà en base pour un autre habitude : on la relie seulement
          // (les résumés existants ne sont pas modifiés).
          if (c.existantId) {
            await supabase.from('habitudes_etudes').insert({
              habitude_id: c.habitude.id,
              etude_id: c.existantId,
            });
            liaisons++;
            console.log(`  - ${c.habitude.slug} : déjà en base (${c.sourceId}), jugée pertinente et reliée.`);
            continue;
          }
          // Quota de nouvelles études déjà atteint dans cette vague : l'étude reste non enregistrée.
          if (e.nouvelles >= e.quotas.nouvelles) continue;
          nouvellesAcceptees.push({ c, analyse });
          e.nouvelles++;
          if (e.nouvelles >= e.quotas.nouvelles) {
            e.termine = true;
            console.log(`  - ${e.habitude.slug} : quota de ${e.quotas.nouvelles} nouvelles études atteint.`);
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
        console.log(`  - ${e.habitude.slug} : quota de ${e.quotas.analyses} analyses Sonnet atteint.`);
      }
    }
  }

  const inacheves = [...etats.values()].filter((e) => !e.termine && e.position < e.file.length);
  if (inacheves.length > 0) {
    console.log(`\n⚠️ Nombre maximal de vagues (${MAX_VAGUES}) atteint, études non examinées pour : ${inacheves.map((e) => e.habitude.slug).join(', ')}`);
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
    const { etude, sourceId, habitude } = c;
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
          // Déjà insérée (par exemple pour un autre habitude de ce même run) : on la relie.
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
        .from('habitudes_etudes')
        .select('habitude_id')
        .eq('habitude_id', habitude.id)
        .eq('etude_id', etudeId)
        .maybeSingle();

      if (lienExistant) continue;

      await supabase.from('habitudes_etudes').insert({
        habitude_id: habitude.id,
        etude_id: etudeId,
      });

      ajoutees++;
      const etiquettePreuve = preuve
        ? `Niveau ${preuve.niveau} — ${preuve.design}${preuve.ajustement ? ` (${preuve.ajustement})` : ''}${preuve.participants ? `, n=${preuve.participants}` : ''}`
        : 'niveau inconnu';
      console.log(`  - ${habitude.slug} : ajoutée (${etiquettePreuve}) : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }

  // ===== Bilan =====
  console.log('\n##### Bilan #####');
  console.log(`Triés Haiku : ${totalTries} | écartés Haiku : ${rejetsHaiku} | analysés Sonnet : ${totalAnalyses} | écartés Sonnet : ${rejetsSonnet} | liaisons : ${liaisons} | nouvelles études ajoutées : ${ajoutees}`);

  if (tousLesEchecs.length > 0) {
    console.log(`\n⚠️ ${tousLesEchecs.length} habitude(s) toujours en échec de recherche. À relancer via slugs_cibles :`);
    console.log(tousLesEchecs.map((x) => x.habitude.slug).join(','));
  } else {
    console.log('\nAucune habitude en échec de recherche.');
  }
  console.log('\nTerminé.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
