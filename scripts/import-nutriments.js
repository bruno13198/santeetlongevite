// Script d'automatisation : récupère des études sur Europe PMC pour les nutriments,
// compléments et plantes (table nutriments), les trie, génère 2 résumés en français via
// l'API Claude, classe leur niveau de preuve, et enregistre tout dans Supabase.
//
// Créé le 9 oct. 2026 sur le modèle d'import-habitudes.js (même mécanique : recherche
// Europe PMC en POST, exclusions de titres, tri Haiku puis analyse Sonnet, classement
// Oxford CEBM 2011, API Message Batches, traitement par vagues, quotas par sujet).
// Différences : tables nutriments / nutriments_etudes / candidats_rejetes_nutriments,
// prompts propres aux nutriments, compléments et plantes, et mode ESTIMATION_SEULE
// (recherche Europe PMC uniquement, aucun appel Claude, pour chiffrer un rattrapage).
//
// Recherche : termes en texte libre (termes_texte) dans le titre et le résumé, plus le
// MeSH si est_terme_mesh (désactivé par défaut pour les nutriments).
// Fenêtre sur FIRST_IDATE (date d'entrée dans Europe PMC), réglable par JOURS_VEILLE.
// Une étude déjà en base (acceptée pour un autre sujet) passe par le même tri
// avant d'être reliée à ce nutriment.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mode estimation : recherche Europe PMC seule, aucun appel Claude, rien n'est écrit.
const ESTIMATION_SEULE = (process.env.ESTIMATION_SEULE || 'false').toLowerCase() === 'true';

// Quotas par nutriment et par run (mêmes valeurs par défaut que pour les habitudes).
const RESULTATS_A_RECUPERER = parseInt(process.env.RESULTATS_A_RECUPERER || '200', 10); // résultats Europe PMC lus (gratuit)
const MAX_ANALYSES_PAR_RUN = parseInt(process.env.MAX_ANALYSES_PAR_RUN || '80', 10); // analyses Sonnet
const MAX_NOUVELLES_ETUDES_PAR_RUN = parseInt(process.env.MAX_NOUVELLES_ETUDES_PAR_RUN || '50', 10); // nouvelles études acceptées
const TAILLE_PAGE_EUROPEPMC = 100;

// Quotas renforcés pour les nutriments à forte littérature (comptage du 9 oct. 2026 :
// plus de 150 études humaines par an). Liste modifiable : ajouter ou retirer un slug suffit.
const QUOTAS_RENFORCES = { resultats: 400, analyses: 160, nouvelles: 100 };
const NUTRIMENTS_GROS_VOLUME = [
  'vitamine-a',
  'vitamine-d',
  'vitamine-b9',
  'proteines-alimentaires',
  'fibres-alimentaires',
  'fer',
  'calcium',
  'sucres-ajoutes',
  'cafeine',
  'omega-3-epa-dha',
  'probiotiques',
  'cbd',
  'bcaa-leucine',
];

function quotasPour(nutriment) {
  if (NUTRIMENTS_GROS_VOLUME.includes(nutriment.slug)) return QUOTAS_RENFORCES;
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

const LIBELLES_CATEGORIE = {
  nutriment: 'le nutriment',
  complement: 'le complément alimentaire',
  plante: 'la plante (prise en complément ou en extrait)',
};

function libelleSujet(nutriment) {
  return `${LIBELLES_CATEGORIE[nutriment.categorie] || 'le nutriment'} : ${nutriment.nom}`;
}

// Mots de TITRE signalant clairement un sujet animal, végétal, informatique
// ou matériau. Même liste que pour les aliments et les habitudes.
// Exception (chercherEtudesEuropePMC) : un titre contenant aussi un marqueur humain
// ("humans", "patients", "trial"...) n'est pas exclu.
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
// MeSH (si est_terme_mesh) OU chacun des termes en texte libre.
function construireFiltreSujet(nutriment) {
  const parties = [];

  if (nutriment.terme_recherche && nutriment.terme_recherche.trim() !== '') {
    if (nutriment.est_terme_mesh) {
      parties.push(`(MESH:"${nutriment.terme_recherche}")`);
    } else {
      parties.push(`(TITLE:"${nutriment.terme_recherche}" OR ABSTRACT:"${nutriment.terme_recherche}")`);
    }
  }

  if (Array.isArray(nutriment.termes_texte)) {
    for (const terme of nutriment.termes_texte) {
      if (terme && terme.trim() !== '') {
        parties.push(`(TITLE:"${terme}" OR ABSTRACT:"${terme}")`);
      }
    }
  }

  return parties.join(' OR ');
}

async function recupererNutrimentsATraiter() {
  const { data: nutriments, error } = await supabase
    .from('nutriments')
    .select('id, slug, nom, categorie, terme_recherche, est_terme_mesh, termes_texte')
    .eq('actif', true)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération nutriments: ${error.message}`);
  }

  const eligibles = nutriments.filter((n) => construireFiltreSujet(n) !== '');

  const slugsCibles = process.env.SLUGS_CIBLES;
  if (slugsCibles) {
    const listeSlugs = slugsCibles.split(',').map((s) => s.trim()).filter(Boolean);
    return eligibles.filter((n) => listeSlugs.includes(n.slug));
  }

  return eligibles;
}

// Appel Europe PMC en POST (searchPOST), avec délai maximal et nouvelles tentatives
// (délai croissant) pour les erreurs temporaires uniquement.
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

async function chercherEtudesEuropePMC(nutriment) {
  const motsClefs = construireFiltreSujet(nutriment);

  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - JOURS_VEILLE);
  const filtreDate = `AND (FIRST_IDATE:[${formaterDate(dateDebut)} TO ${formaterDate(new Date())}])`;

  const exclusionTitre = MOTS_EXCLUS_TITRE.map((m) => `TITLE:"${m}"`).join(' OR ');
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

  const maxResultats = quotasPour(nutriment).resultats;
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
// est renvoyée dans un nouveau lot, jusqu'à 3 tentatives au total.
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
// Prompts « nutriments, compléments, plantes »
// ---------------------------------------------------------------------------

// Tri rapide par Haiku : n'écarte que les cas CLAIREMENT hors sujet.
// En cas de doute ou d'erreur, laisse passer (Sonnet tranchera).
function promptTri(titreOriginal, abstractOriginal, nutriment) {
  return `Tu fais un PREMIER TRI RAPIDE d'études scientifiques pour une fiche sur ${libelleSujet(nutriment)}

Titre : ${titreOriginal}
Résumé : ${abstractOriginal}

Réponds "false" UNIQUEMENT si l'étude est CLAIREMENT dans l'un de ces cas :
- elle porte uniquement sur des animaux, des cellules, des tissus isolés ou des modèles in vitro/in silico, sans aucun sujet humain ;
- le terme de recherche est un homonyme ou désigne un autre usage que sa consommation : réactif ou outil de laboratoire (marquage à la biotine, acide ascorbique utilisé comme réactif...), médicament qui s'oppose à ce nutriment (anti-vitamine K), récepteur ou voie biologique étudiés pour eux-mêmes (récepteur des folates pour cibler un cancer, NAD en biologie cellulaire), traitement non nutritionnel (riboflavine pour la cornée), autre sens du mot ;
- le produit est uniquement appliqué sur la peau, les yeux ou les muqueuses, inhalé, injecté ou perfusé, sans aucune prise par la bouche ;
- ce sujet n'a aucun rapport réel avec l'étude (absent, ou mentionné seulement en passant) ;
- l'étude porte sur l'élevage, l'alimentation animale, l'agronomie, un procédé industriel ou la formulation d'un produit ;
- il s'agit d'un protocole sans résultats, d'une notice de rétractation, d'un éditorial, d'un commentaire ou d'une lettre ;
- elle développe ou valide une méthode d'analyse, un questionnaire ou un outil de mesure ;
- ce sujet n'est qu'un ingrédient parmi beaucoup d'autres (produit à nombreux ingrédients, score alimentaire, nombreux nutriments étudiés ensemble) sans effet propre isolé ; une association de 2 ou 3 ingrédients bien identifiés (par exemple vitamine D et calcium) reste pertinente ;
- elle porte uniquement sur la fréquence d'utilisation, les ventes, les connaissances ou les perceptions, sans mesurer de résultat de santé ;
- elle porte sur la composition, le dosage, l'étiquetage ou la contamination de produits, sans effet de santé observé chez des personnes ;
- elle mesure uniquement un taux sanguin, un statut ou une carence, sans mesurer d'apport alimentaire ni de supplémentation.

Dans TOUS les autres cas, y compris en cas de doute, réponds "true" : une analyse plus fine sera faite ensuite.
Une étude chez l'humain qui ne trouve AUCUN effet est un résultat valable : réponds "true".
Un effet indésirable, une intoxication ou une interaction observés chez l'humain sont pertinents : réponds "true".

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

function promptAnalyse(titreOriginal, abstractOriginal, nutriment) {
  return `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.

Cette étude a été trouvée en recherchant des publications sur ${libelleSujet(nutriment)}

Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}

Étape 1 — Vérifie le SUJET :
L'étude porte-t-elle vraiment et spécifiquement sur « ${nutriment.nom} » consommé par la bouche, que ce soit par l'alimentation, sous forme de complément ou d'extrait ? Si le terme désigne autre chose (réactif de laboratoire, médicament antagoniste, récepteur ou voie biologique étudiés pour eux-mêmes, traitement non nutritionnel, homonyme) ou si le sujet n'est mentionné qu'en passant, réponds "false".

Étape 2 — Évalue la pertinence humaine :
Cette étude mesure-t-elle un EFFET, un BÉNÉFICE, un RISQUE ou une ASSOCIATION (sur la santé, une maladie, un marqueur biologique, les performances physiques...) chez des sujets HUMAINS qui consomment ou prennent ce produit, ou via une méta-analyse ou une revue qui synthétise de tels résultats humains ?
Sont pertinents :
- les essais cliniques, méta-analyses et revues systématiques ;
- les études observationnelles (cohortes, cas-témoins) reliant l'apport alimentaire ou la prise de complément à un résultat de santé ;
- les effets indésirables, intoxications et interactions observés chez l'humain ;
- une revue narrative ou mécanistique consacrée à ce sujet et à ses effets sur la santé (même fondée surtout sur des données animales ou cellulaires) : elle sera classée à part, au niveau de preuve le plus bas.
Un résultat de santé désigne : une maladie ou son risque, des symptômes, un marqueur biologique, la mortalité, le poids ou la composition corporelle, la fonction cognitive ou la santé mentale, les performances physiques, cognitives ou scolaires.
Réponds "false" dans les cas suivants :
- L'étude porte uniquement sur des animaux ou des cellules en laboratoire, sans effet mesuré chez l'humain (hors revue consacrée au sujet, voir ci-dessus).
- Le produit est uniquement appliqué sur la peau, les yeux ou les muqueuses, inhalé, injecté ou perfusé, sans prise par la bouche.
- L'étude mesure uniquement un taux sanguin, un statut ou une carence, sans mesurer l'apport alimentaire ni une supplémentation.
- Ce sujet n'est qu'un ingrédient parmi beaucoup d'autres (produit à nombreux ingrédients, score alimentaire, nombreux nutriments étudiés ensemble) et son effet propre n'est pas isolé. Une association de 2 ou 3 ingrédients bien identifiés, dont celui-ci (par exemple vitamine D et calcium), reste pertinente.
- L'étude porte uniquement sur la fréquence d'utilisation, les ventes, les connaissances, les perceptions ou les déterminants de la consommation, sans résultat de santé.
- L'étude décrit seulement la composition, le dosage, l'étiquetage, la qualité ou la contamination de produits, sans effet de santé observé chez des personnes.
- L'étude valide un outil de mesure, un questionnaire ou une méthode d'analyse.
- Il s'agit d'un consensus d'experts (Delphi), d'un éditorial, d'un commentaire, d'une lettre ou d'un protocole d'étude sans résultats.
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
- Préciser s'il s'agit d'un apport par l'alimentation, d'un complément ou d'un extrait, et la dose quand elle est indiquée
- Rester factuel, ne pas exagérer les conclusions
- Varier le style et la structure des phrases
- Rédiger uniquement en français`;
}

function interpreterAnalyse(texte) {
  const objet = extraireJSON(texte).objet;
  if (typeof objet.pertinent !== 'boolean') throw new Error('champ pertinent absent');
  return objet;
}

// Niveau de preuve selon l'échelle d'Oxford (CEBM 2011), étude par étude.
// Évalué à partir du titre et du résumé uniquement.
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
  return `Tu es un méthodologiste en médecine fondée sur les preuves. Classe l'étude ci-dessous selon l'échelle des niveaux de preuve d'Oxford (CEBM 2011), pour la question « ce nutriment, ce complément ou cette plante a-t-il cet effet sur la santé ? ». Base-toi uniquement sur le titre et le résumé.

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

// Correspondance transitoire avec l'ancien champ niveau_fiabilite.
function niveauFiabiliteDepuisPreuve(niveau) {
  if (niveau === 1) return 'haute';
  if (niveau === 2) return 'moderee';
  if (niveau >= 3 && niveau <= 5) return 'preliminaire';
  return null;
}

async function enregistrerRejet(nutrimentId, sourceId, titre, raison) {
  await supabase.from('candidats_rejetes_nutriments').insert({
    nutriment_id: nutrimentId,
    source_id: sourceId,
    titre_original: titre,
    raison: raison,
  });
}

// ---------------------------------------------------------------------------
// Phase 1 : collecte des candidats d'un nutriment (Europe PMC + vérifications en base)
// ---------------------------------------------------------------------------

async function collecterCandidats(nutriment) {
  console.log(`\n=== ${nutriment.slug} ===`);

  const { resultats, total } = await chercherEtudesEuropePMC(nutriment);
  console.log(`  ${total} résultats au total sur Europe PMC, ${resultats.length} examinés${total > resultats.length ? ' ⚠️ DÉBORDEMENT' : ''}.`);
  await pause(300);

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
        .from('nutriments_etudes')
        .select('nutriment_id')
        .eq('nutriment_id', nutriment.id)
        .eq('etude_id', existant.id)
        .maybeSingle();

      if (lienExistant) continue; // déjà en base et déjà liée
    }

    const { data: dejaRejete } = await supabase
      .from('candidats_rejetes_nutriments')
      .select('source_id')
      .eq('nutriment_id', nutriment.id)
      .eq('source_id', sourceId)
      .limit(1)
      .maybeSingle();

    if (dejaRejete) continue; // déjà rejeté précédemment pour ce nutriment

    if (!etude.abstractText) continue; // pas de résumé disponible

    candidats.push({
      nutriment,
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
  console.log(`Paramètres de ce run : ESTIMATION_SEULE=${ESTIMATION_SEULE}, OFFSET=${OFFSET}, LIMITE=${LIMITE}, JOURS_VEILLE=${JOURS_VEILLE}, RESULTATS_A_RECUPERER=${RESULTATS_A_RECUPERER}, MAX_NOUVELLES=${MAX_NOUVELLES_ETUDES_PAR_RUN}, MAX_ANALYSES=${MAX_ANALYSES_PAR_RUN}, MAX_VAGUES=${MAX_VAGUES}, nutriments à quotas renforcés : ${NUTRIMENTS_GROS_VOLUME.length}`);
  const tousLesNutriments = await recupererNutrimentsATraiter();
  const lot = tousLesNutriments.slice(OFFSET, OFFSET + LIMITE);
  console.log(`${tousLesNutriments.length} nutriments éligibles au total. Lot traité : offset ${OFFSET}, ${lot.length} nutriments (jusqu'à l'offset ${OFFSET + lot.length}).`);

  // ===== Phase 1 : recherche Europe PMC =====
  console.log('\n##### Recherche Europe PMC #####');
  const candidats = [];
  let enEchec = [];
  const echecsDefinitifs = [];

  for (const nutriment of lot) {
    try {
      candidats.push(...(await collecterCandidats(nutriment)));
    } catch (e) {
      console.log(`Erreur générale sur ${nutriment.slug}:`, e.message);
      if (e.temporaire === false) {
        echecsDefinitifs.push({ nutriment, message: e.message });
      } else {
        enEchec.push({ nutriment, message: e.message });
      }
    }
  }

  const PAUSES_REPRISE_MIN = [5, 15];
  for (let passe = 0; passe < PAUSES_REPRISE_MIN.length && enEchec.length > 0; passe++) {
    const duree = PAUSES_REPRISE_MIN[passe];
    console.log(`\n${enEchec.length} nutriment(s) en échec. Reprise ${passe + 1}/${PAUSES_REPRISE_MIN.length} dans ${duree} min : ${enEchec.map((x) => x.nutriment.slug).join(', ')}`);
    await pause(duree * 60 * 1000);

    const encoreEnEchec = [];
    for (const { nutriment } of enEchec) {
      try {
        candidats.push(...(await collecterCandidats(nutriment)));
      } catch (e) {
        console.log(`Erreur générale (reprise ${passe + 1}) sur ${nutriment.slug}:`, e.message);
        if (e.temporaire === false) {
          echecsDefinitifs.push({ nutriment, message: e.message });
        } else {
          encoreEnEchec.push({ nutriment, message: e.message });
        }
      }
    }
    enEchec = encoreEnEchec;
  }

  const tousLesEchecs = [...echecsDefinitifs, ...enEchec];

  // ===== Mode estimation : bilan des candidats, aucun appel Claude, rien n'est écrit =====
  if (ESTIMATION_SEULE) {
    const parNutriment = new Map();
    for (const c of candidats) {
      parNutriment.set(c.nutriment.slug, (parNutriment.get(c.nutriment.slug) || 0) + 1);
    }
    let maxSonnet = 0;
    console.log('\n##### ESTIMATION (aucun appel Claude) #####');
    console.log('Nutriment | candidats à trier par Haiku | analyses Sonnet maximum (quota)');
    for (const n of lot) {
      const nb = parNutriment.get(n.slug) || 0;
      const plafond = Math.min(nb, quotasPour(n).analyses);
      maxSonnet += plafond;
      console.log(`${n.slug} | ${nb} | ${plafond}`);
    }
    console.log(`\nTotal : ${candidats.length} candidat(s) à trier par Haiku, au plus ${maxSonnet} analyse(s) Sonnet (moins en pratique : Haiku en écarte une partie).`);
    if (tousLesEchecs.length > 0) {
      console.log(`⚠️ Recherche en échec pour : ${tousLesEchecs.map((x) => x.nutriment.slug).join(',')}`);
    }
    console.log('\nTerminé (estimation seule).');
    return;
  }

  for (const { nutriment, message } of tousLesEchecs) {
    await supabase.from('erreurs_import').insert({
      aliment_slug: nutriment.slug,
      type_erreur: 'echec_recherche_nutriment',
      message,
    });
  }

  candidats.forEach((c, i) => {
    c.cle = `c${i}`;
  });
  console.log(`\n${candidats.length} candidat(s) au total, avant tri.`);

  // ===== Phases 2 et 3 : tri Haiku puis analyse Sonnet, par vagues =====
  const etats = new Map(); // nutriment.id -> état du nutriment
  for (const c of candidats) {
    if (!etats.has(c.nutriment.id)) {
      etats.set(c.nutriment.id, {
        nutriment: c.nutriment,
        quotas: quotasPour(c.nutriment),
        file: [],
        position: 0,
        tries: 0,
        retenusHaiku: 0,
        analyses: 0,
        nouvelles: 0,
        termine: false,
      });
    }
    etats.get(c.nutriment.id).file.push(c);
  }

  const nouvellesAcceptees = []; // { c, analyse }
  let totalTries = 0;
  let rejetsHaiku = 0;
  let totalAnalyses = 0;
  let rejetsSonnet = 0;
  let liaisons = 0;

  for (let vague = 1; vague <= MAX_VAGUES; vague++) {
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
        prompt: promptTri(c.etude.title, c.etude.abstractText, c.nutriment),
      })),
      interpreterTri,
      `Tri Haiku v${vague}`
    );
    totalTries += aTrier.length;

    const aAnalyser = [];
    for (const e of etats.values()) {
      if (!e.vague || e.vague.length === 0) continue;
      const restantes = e.quotas.analyses - e.analyses;
      for (const c of e.vague) {
        e.tries++;
        const tri = tris.get(`tri-${c.cle}`);
        if (tri && tri.pertinent === false) {
          rejetsHaiku++;
          await enregistrerRejet(c.nutriment.id, c.sourceId, c.etude.title, `[Haiku] ${tri.raison}`);
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
          prompt: promptAnalyse(c.etude.title, c.etude.abstractText, c.nutriment),
        })),
        interpreterAnalyse,
        `Analyse Sonnet v${vague}`
      );
      totalAnalyses += aAnalyser.length;

      for (const e of etats.values()) {
        for (const c of e.analysesVague || []) {
          e.analyses++;
          const analyse = analyses.get(`ana-${c.cle}`);
          if (!analyse) {
            console.log(`  - Analyse impossible (${c.nutriment.slug}, ${c.sourceId}), on passe.`);
            continue;
          }
          if (!analyse.pertinent) {
            rejetsSonnet++;
            await enregistrerRejet(c.nutriment.id, c.sourceId, c.etude.title, analyse.raison);
            continue;
          }
          // Étude déjà en base pour un autre sujet : on la relie seulement.
          if (c.existantId) {
            await supabase.from('nutriments_etudes').insert({
              nutriment_id: c.nutriment.id,
              etude_id: c.existantId,
            });
            liaisons++;
            console.log(`  - ${c.nutriment.slug} : déjà en base (${c.sourceId}), jugée pertinente et reliée.`);
            continue;
          }
          if (e.nouvelles >= e.quotas.nouvelles) continue;
          nouvellesAcceptees.push({ c, analyse });
          e.nouvelles++;
          if (e.nouvelles >= e.quotas.nouvelles) {
            e.termine = true;
            console.log(`  - ${e.nutriment.slug} : quota de ${e.quotas.nouvelles} nouvelles études atteint.`);
          }
        }
      }
    }

    for (const e of etats.values()) {
      e.vague = [];
      e.analysesVague = [];
      if (!e.termine && e.analyses >= e.quotas.analyses) {
        e.termine = true;
        console.log(`  - ${e.nutriment.slug} : quota de ${e.quotas.analyses} analyses Sonnet atteint.`);
      }
    }
  }

  const inacheves = [...etats.values()].filter((e) => !e.termine && e.position < e.file.length);
  if (inacheves.length > 0) {
    console.log(`\n⚠️ Nombre maximal de vagues (${MAX_VAGUES}) atteint, études non examinées pour : ${inacheves.map((e) => e.nutriment.slug).join(', ')}`);
  }
  console.log(`\n${totalTries} étude(s) triée(s) par Haiku (${rejetsHaiku} écartée(s)), ${totalAnalyses} analysée(s) par Sonnet (${rejetsSonnet} écartée(s)), ${liaisons} liaison(s), ${nouvellesAcceptees.length} nouvelle(s) étude(s) acceptée(s).`);

  // ===== Niveau de preuve (un lot, une requête par étude) puis enregistrement =====
  console.log('\n##### Niveau de preuve et enregistrement #####');
  const etudesAClasser = new Map();
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
    const { etude, sourceId, nutriment } = c;
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
          nb_participants: preuve ? preuve.participants : extraireNbParticipants(etude.abstractText),
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
        .from('nutriments_etudes')
        .select('nutriment_id')
        .eq('nutriment_id', nutriment.id)
        .eq('etude_id', etudeId)
        .maybeSingle();

      if (lienExistant) continue;

      await supabase.from('nutriments_etudes').insert({
        nutriment_id: nutriment.id,
        etude_id: etudeId,
      });

      ajoutees++;
      const etiquettePreuve = preuve
        ? `Niveau ${preuve.niveau} — ${preuve.design}${preuve.ajustement ? ` (${preuve.ajustement})` : ''}${preuve.participants ? `, n=${preuve.participants}` : ''}`
        : 'niveau inconnu';
      console.log(`  - ${nutriment.slug} : ajoutée (${etiquettePreuve}) : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }

  console.log('\n##### Bilan #####');
  console.log(`Triés Haiku : ${totalTries} | écartés Haiku : ${rejetsHaiku} | analysés Sonnet : ${totalAnalyses} | écartés Sonnet : ${rejetsSonnet} | liaisons : ${liaisons} | nouvelles études ajoutées : ${ajoutees}`);

  if (tousLesEchecs.length > 0) {
    console.log(`\n⚠️ ${tousLesEchecs.length} nutriment(s) toujours en échec de recherche. À relancer via slugs_cibles :`);
    console.log(tousLesEchecs.map((x) => x.nutriment.slug).join(','));
  } else {
    console.log('\nAucun nutriment en échec de recherche.');
  }
  console.log('\nTerminé.');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
