// Script d'automatisation : récupère des études sur Europe PMC pour les habitudes
// alimentaires (régimes, patterns), génère 2 résumés en français via l'API Claude,
// classe leur fiabilité, et enregistre tout dans Supabase.
// Contrairement à import-etudes.js, la recherche utilise le champ MeSH dédié
// (MESH:"...") plutôt qu'une recherche par mots-clés dans le titre/résumé —
// les termes des habitudes alimentaires sont des descripteurs MeSH officiels,
// pas des noms communs, et une recherche par mots-clés serait imprécise
// (ex: "Dietary Approaches To Stop Hypertension" découpé en mots séparés
// raterait la plupart des études qui utilisent l'acronyme "DASH").

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESULTATS_A_RECUPERER = parseInt(process.env.RESULTATS_A_RECUPERER || '20', 10);
const MAX_NOUVELLES_ETUDES_PAR_RUN = parseInt(process.env.MAX_NOUVELLES_ETUDES_PAR_RUN || '8', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const LIMITE = parseInt(process.env.LIMITE || '200', 10);
const JOURS_VEILLE = parseInt(process.env.JOURS_VEILLE || '10', 10);

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

  for (const match of texte.matchAll(/\bn\s*=\s*(\d[\d,\s]{0,6})/gi)) {
    const parsed = parseInt(match[1].replace(/[,\s]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 100000) return parsed;
  }

  for (const match of texte.matchAll(
    /(\d[\d,]{0,6})\s+(?:\w+\s+){0,3}?(participants|patients|subjects|adults|volunteers|individuals|men|women|males|females|children|adolescents)/gi
  )) {
    const parsed = parseInt(match[1].replace(/,/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 100000) return parsed;
  }

  for (const match of texte.matchAll(
    /\b([A-Za-z]+(?:-[A-Za-z]+)?)\s+(?:\w+\s+){0,3}?(participants|patients|subjects|adults|volunteers|individuals|men|women|males|females|children|adolescents)/gi
  )) {
    const nombre = motEnNombre(match[1]);
    if (nombre && nombre > 0) return nombre;
  }

  return null;
}

async function recupererHabitudesATraiter() {
  const { data: habitudes, error } = await supabase
    .from('habitudes_alimentaires')
    .select('id, slug, nom, terme_recherche')
    .eq('actif', true)
    .not('terme_recherche', 'is', null)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération habitudes: ${error.message}`);
  }

  const slugsCibles = process.env.SLUGS_CIBLES;
  if (slugsCibles) {
    const listeSlugs = slugsCibles.split(',').map((s) => s.trim());
    return habitudes.filter((h) => listeSlugs.includes(h.slug));
  }

  return habitudes;
}

async function chercherEtudesEuropePMC(termeMesh, tentative = 1) {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - JOURS_VEILLE);
  const filtreDate = `AND (FIRST_PDATE:[${formaterDate(dateDebut)} TO ${formaterDate(new Date())}])`;

  const requete = `(MESH:"${termeMesh}") AND (SRC:MED) AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial") ${filtreDate}`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${RESULTATS_A_RECUPERER}&resultType=core`;
  const res = await fetch(url);

  const ERREURS_TEMPORAIRES = [500, 502, 503, 504];

  if (!res.ok) {
    if (ERREURS_TEMPORAIRES.includes(res.status) && tentative < 3) {
      console.log(`  Europe PMC indisponible (${res.status}), nouvelle tentative dans 3s (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return chercherEtudesEuropePMC(termeMesh, tentative + 1);
    }
    throw new Error(`Europe PMC erreur ${res.status}`);
  }

  const data = await res.json();
  return data.resultList?.result || [];
}

async function analyserEtude(titreOriginal, abstractOriginal, nomHabitude, tentative = 1) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.

Cette étude a été trouvée en recherchant des publications sur l'habitude alimentaire suivante : ${nomHabitude}

Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}

Étape 1 — Vérifie le SUJET :
L'étude teste-t-elle vraiment et spécifiquement ce régime/pattern alimentaire (« ${nomHabitude} »), pas juste une mention en passant ou une comparaison lointaine ? Si l'étude porte sur un sujet différent qui a seulement été indexé sous ce terme MeSH par erreur ou de façon marginale, réponds "false".

Étape 2 — Évalue la pertinence humaine :
Cette étude mesure-t-elle un EFFET ou un BÉNÉFICE (sur la santé, une maladie, un marqueur biologique...) directement chez des sujets HUMAINS suivant ce régime, ou via une méta-analyse/revue qui synthétise de tels résultats humains ?
Réponds "false" dans les cas suivants :
- L'étude porte uniquement sur des animaux ou des cellules en laboratoire, sans effet mesuré chez l'humain.
- L'étude décrit seulement la théorie ou la composition du régime, sans mesurer d'effet de santé concret chez l'humain.
- Tout autre sujet hors nutrition/santé humaine.
Ne réponds "true" que si un effet ou bénéfice a été concrètement évalué chez des sujets humains suivant ce régime.

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
- Ne jamais transformer une corrélation en causalité si l'étude ne le permet pas
- Rester factuel, ne pas exagérer les conclusions
- Varier le style et la structure des phrases
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
      return analyserEtude(titreOriginal, abstractOriginal, nomHabitude, tentative + 1);
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
- "preliminaire" : étude observationnelle, étude de cohorte, étude pilote, type incertain
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

async function traiterHabitude(habitude) {
  console.log(`\n=== ${habitude.slug} ===`);

  const resultats = await chercherEtudesEuropePMC(habitude.terme_recherche);
  console.log(`  ${resultats.length} études trouvées sur Europe PMC (avant filtrage humain).`);
  await new Promise((resolve) => setTimeout(resolve, 300));

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
        .from('habitudes_etudes')
        .select('habitude_id')
        .eq('habitude_id', habitude.id)
        .eq('etude_id', existant.id)
        .maybeSingle();

      if (!lienExistant) {
        await supabase.from('habitudes_etudes').insert({
          habitude_id: habitude.id,
          etude_id: existant.id,
        });
        nouvellesEtudesAjoutees++;
        console.log(`  - Déjà en base (${sourceId}), reliée à cette habitude.`);
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
      .from('candidats_rejetes_habitudes')
      .select('source_id')
      .eq('habitude_id', habitude.id)
      .eq('source_id', sourceId)
      .maybeSingle();

    if (dejaRejete) {
      console.log(`  - Déjà rejeté précédemment (${sourceId}), on passe.`);
      continue;
    }

    try {
      const analyse = await analyserEtude(etude.title, etude.abstractText, habitude.nom);

      if (!analyse.pertinent) {
        console.log(`  - Écartée (${sourceId}) : ${analyse.raison}`);
        await supabase.from('candidats_rejetes_habitudes').insert({ habitude_id: habitude.id, source_id: sourceId });
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
        .from('habitudes_etudes')
        .select('habitude_id')
        .eq('habitude_id', habitude.id)
        .eq('etude_id', etudeId)
        .maybeSingle();

      if (lienExistant) {
        console.log(`  - Déjà liée à cette habitude (${sourceId}), on passe.`);
        continue;
      }

      await supabase.from('habitudes_etudes').insert({
        habitude_id: habitude.id,
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
  const toutesLesHabitudes = await recupererHabitudesATraiter();
  const lot = toutesLesHabitudes.slice(OFFSET, OFFSET + LIMITE);
  console.log(`${toutesLesHabitudes.length} habitudes éligibles au total. Lot traité : offset ${OFFSET}, ${lot.length} habitudes.`);

  for (const habitude of lot) {
    try {
      await traiterHabitude(habitude);
    } catch (e) {
      console.log(`Erreur générale sur ${habitude.slug}:`, e.message);
      await supabase.from('erreurs_import').insert({
        aliment_slug: habitude.slug,
        type_erreur: 'echec_recherche',
        message: e.message,
      });
    }
  }
  console.log('\nTerminé.');
}

main();
