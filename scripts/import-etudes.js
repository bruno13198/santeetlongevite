// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, classe leur fiabilité,
// et enregistre tout dans Supabase.
// Phase actuelle : veille continue, avec recherche limitée aux études publiées
// récemment (JOURS_VEILLE) et un garde-fou sur le nombre de nouvelles études
// ajoutées par aliment à chaque run.
// Traite un lot d'aliments (offset/limite passés en variables d'environnement).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESULTATS_A_RECUPERER = parseInt(process.env.RESULTATS_A_RECUPERER || '20', 10);
const MAX_NOUVELLES_ETUDES_PAR_RUN = parseInt(process.env.MAX_NOUVELLES_ETUDES_PAR_RUN || '8', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const LIMITE = parseInt(process.env.LIMITE || '200', 10);
const JOURS_VEILLE = parseInt(process.env.JOURS_VEILLE || '10', 10); // fenêtre de recherche en jours ; 10 par défaut pour le cron hebdomadaire, ajustable ponctuellement via la variable d'environnement

const EXCEPTIONS_NOVA4 = [
  'isolat-de-soja',
  'cola-sucre',
  'lecithine-de-soja',
  'kimchi',
  'kombucha',
];

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
  // On essaie CHAQUE correspondance jusqu'à en trouver une qui donne vraiment un nombre.
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
    .select('id, slug, niveau_nova, terme_recherche')
    .not('terme_recherche', 'is', null)
    .neq('terme_recherche', '')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération aliments: ${error.message}`);
  }

  const eligibles = aliments.filter(
    (a) => [1, 2, 3].includes(a.niveau_nova) || EXCEPTIONS_NOVA4.includes(a.slug)
  );

  const slugsCibles = process.env.SLUGS_CIBLES;
  if (slugsCibles) {
    const listeSlugs = slugsCibles.split(',').map((s) => s.trim());
    return eligibles.filter((a) => listeSlugs.includes(a.slug));
  }

  return eligibles;
}

async function chercherEtudesEuropePMC(terme, tentative = 1) {
  // Retire un nom scientifique latin (Genre espèce) en fin de terme,
  // ex. "garlic Allium sativum" -> "garlic", "sweet potato Ipomoea batatas" -> "sweet potato"
  const termeSansNomScientifique = terme.replace(/\s+[A-Z][a-zà-ÿ]+\s+[a-zà-ÿ]+$/, '');

  const motsClefs = termeSansNomScientifique
    .split(' ')
    .map((mot) => `(TITLE:"${mot}" OR ABSTRACT:"${mot}")`)
    .join(' AND ');

  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - JOURS_VEILLE);
  const filtreDate = `AND (FIRST_PDATE:[${formaterDate(dateDebut)} TO ${formaterDate(new Date())}])`;

  const requete = `(${motsClefs}) AND (SRC:MED) AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial") ${filtreDate}`;
 const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${RESULTATS_A_RECUPERER}&resultType=core`;
  const res = await fetch(url);
  
 const ERREURS_TEMPORAIRES = [500, 502, 503, 504];

  if (!res.ok) {
    if (ERREURS_TEMPORAIRES.includes(res.status) && tentative < 3) {
      console.log(`  Europe PMC indisponible (${res.status}), nouvelle tentative dans 3s (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return chercherEtudesEuropePMC(terme, tentative + 1);
    }
    throw new Error(`Europe PMC erreur ${res.status}`);
  }

  const data = await res.json();
  return data.resultList?.result || [];
}

async function analyserEtude(titreOriginal, abstractOriginal, nomAliment, tentative = 1) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.

Cette étude a été trouvée en recherchant des publications sur : ${nomAliment}

Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
Étape 1 — Vérifie le SUJET :
L'étude parle-t-elle vraiment et spécifiquement de « ${nomAliment} » (ou d'un synonyme/nom scientifique direct de cet aliment) ? Une simple co-occurrence de mots-clés ou une confusion terminologique (ex : un homonyme, une espèce différente, un aliment qui n'apparaît que dans la bibliographie ou en comparaison lointaine) ne compte pas. Si l'étude porte en réalité sur un autre sujet qui a seulement été mal indexé sous ce terme de recherche, réponds "false".
Réponds également "false" si l'étude porte sur une catégorie large regroupant plusieurs aliments différents (ex : « les épices », « les légumineuses », « les crucifères »), sans isoler de résultat spécifique et individualisé propre à « ${nomAliment} » — même si « ${nomAliment} » est cité une ou plusieurs fois dans la liste des aliments couverts par l'étude.

Étape 2 — Évalue la pertinence humaine :
Cette étude mesure-t-elle un EFFET ou un BÉNÉFICE (sur la santé, une maladie, un marqueur biologique...) directement chez des sujets HUMAINS, ou via une méta-analyse/revue qui synthétise de tels résultats humains ?
Réponds "false" dans les cas suivants :
- L'étude porte uniquement sur des animaux, des cellules en laboratoire (in vitro), ou des plantes (agronomie, botanique), SANS effet mesuré chez l'humain.
- L'étude décrit seulement l'absorption, le métabolisme ou la biodisponibilité d'un composé chez l'humain, mais SANS mesurer un effet ou bénéfice de santé concret chez l'humain. La simple présence de données pharmacocinétiques humaines ne suffit pas si l'effet biologique testé n'a été observé qu'en laboratoire ou chez l'animal.
- Tout autre sujet hors nutrition/santé humaine.
Ne réponds "true" que si un effet ou bénéfice a été concrètement évalué chez des sujets humains (essai clinique, cohorte, méta-analyse de données humaines).

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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur API Claude ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const texte = data.content.map((b) => b.text || '').join('');
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);

  try {
    return JSON.parse(match ? match[0] : nettoye);
  } catch (e) {
    if (tentative < 3) {
      console.log(`  Réponse d'analyse incomplète, nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return analyserEtude(titreOriginal, abstractOriginal, nomAliment, tentative + 1);
    }
    throw new Error(`JSON invalide reçu de Claude après 3 tentatives : ${e.message} | Début du texte reçu : ${nettoye.slice(0, 200)}`);
  }
}

async function classerFiabilite(titre, resumeOriginal, tentative = 1) {
  const prompt = `Tu es un méthodologiste scientifique. Classe le TYPE D'ÉTUDE suivant dans une seule des 3 catégories ci-dessous, en te basant uniquement sur le titre et le résumé.
Titre : ${titre}
Résumé : ${resumeOriginal}
Catégories :
- "haute" : méta-analyse, revue systématique (synthèse de plusieurs études)
- "moderee" : essai randomisé contrôlé (RCT), essai clinique interventionnel
- "preliminaire" : étude observationnelle, étude de cohorte, étude pilote, étude in vitro/animale mentionnée comme telle, ou type incertain
Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"niveau": "haute"}
ou
{"niveau": "moderee"}
ou
{"niveau": "preliminaire"}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur API Claude ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const texte = data.content.map((b) => b.text || '').join('');
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  try {
    const resultat = JSON.parse(match ? match[0] : nettoye);
    if (!resultat.niveau) throw new Error('Champ niveau manquant');
    return resultat.niveau;
  } catch (e) {
    if (tentative < 3) {
      console.log(`      Réponse fiabilité incomplète ("${nettoye}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return classerFiabilite(titre, resumeOriginal, tentative + 1);
    }
    console.log(`      Échec classement fiabilité après 3 tentatives. Dernière réponse reçue : "${nettoye}"`);
    return null;
  }
}

async function traiterAliment(aliment) {
  console.log(`\n=== ${aliment.slug} ===`);

  const resultats = await chercherEtudesEuropePMC(aliment.terme_recherche);
  console.log(`  ${resultats.length} études trouvées sur Europe PMC (avant filtrage humain).`);
  await new Promise((resolve) => setTimeout(resolve, 300)); // pause pour éviter de saturer Europe PMC

  // Déduplication défensive : Europe PMC peut renvoyer le même article deux fois
  // dans une même page de résultats.
  const dejaVusDansCeLot = new Set();
  const resultatsUniques = resultats.filter((etude) => {
    const sourceId = etude.id || etude.pmid;
    if (!sourceId || dejaVusDansCeLot.has(sourceId)) return false;
    dejaVusDansCeLot.add(sourceId);
    return true;
  });

  let nouvellesEtudesAjoutees = 0;

  for (const etude of resultatsUniques) {
    if (nouvellesEtudesAjoutees >= MAX_NOUVELLES_ETUDES_PAR_RUN) {
      console.log(`  - Garde-fou de ${MAX_NOUVELLES_ETUDES_PAR_RUN} nouvelles études atteint pour ce run, on arrête ici.`);
      break;
    }

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

      if (!lienExistant) {
        await supabase.from('aliments_etudes').insert({
          aliment_id: aliment.id,
          etude_id: existant.id,
        });
        nouvellesEtudesAjoutees++;
        console.log(`  - Déjà en base (${sourceId}), reliée à cet aliment.`);
      } else {
        console.log(`  - Déjà en base et déjà liée (${sourceId}), on passe.`);
      }
      continue;
    }

    if (!etude.abstractText) {
      console.log(`  - Pas de résumé disponible pour ${sourceId}, on passe.`);
      continue;
    }

    const { data: dejaRejete } = await supabase
      .from('candidats_rejetes')
      .select('source_id')
      .eq('aliment_id', aliment.id)
      .eq('source_id', sourceId)
      .maybeSingle();

    if (dejaRejete) {
      console.log(`  - Déjà rejeté précédemment (${sourceId}), on passe.`);
      continue;
    }

    try {
      const analyse = await analyserEtude(etude.title, etude.abstractText, aliment.terme_recherche);

      if (!analyse.pertinent) {
        console.log(`  - Écartée (${sourceId}) : ${analyse.raison}`);
        await supabase.from('candidats_rejetes').insert({ aliment_id: aliment.id, source_id: sourceId });
        continue;
      }

      const niveauFiabilite = await classerFiabilite(etude.title, etude.abstractText);
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
      console.log(`  - Ajoutée (${niveauFiabilite || 'fiabilité inconnue'}) : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }
}

async function main() {
  console.log(`Paramètres de ce run : OFFSET=${OFFSET}, LIMITE=${LIMITE}, JOURS_VEILLE=${JOURS_VEILLE}`);
  const tousLesAliments = await recupererAlimentsATraiter();
  const lot = tousLesAliments.slice(OFFSET, OFFSET + LIMITE);
  console.log(`${tousLesAliments.length} aliments éligibles au total. Lot traité : offset ${OFFSET}, ${lot.length} aliments (jusqu'à l'offset ${OFFSET + lot.length}).`);

  for (const aliment of lot) {
    try {
      await traiterAliment(aliment);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
      await supabase.from('erreurs_import').insert({
        aliment_slug: aliment.slug,
        type_erreur: 'echec_recherche',
        message: e.message,
      });
    }
  }
  console.log('\nTerminé.');
}

main();
 

 
