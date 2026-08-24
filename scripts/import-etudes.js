// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, classe leur fiabilité,
// et enregistre tout dans Supabase.
// Le filtrage "humain / pertinent" est fait par Claude lui-même, en lisant le résumé
// (plus fiable que les tags MeSH, qui manquent souvent sur les articles récents).
// Pas de plafond permanent, jamais de remplacement : c'est une veille continue,
// chaque run ajoute les nouvelles études sérieuses trouvées.
// Traite 200 aliments par run max (curseur mémorisé dans la table etat_import),
// pour des runs plus courts et faciles à surveiller.
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
const PAGE_SIZE_MAX = 30;
const SEUIL_ALIMENT_RECHERCHE = 100;
const NB_RESULTATS_ALIMENT_RECHERCHE = 30;
const NB_RESULTATS_ALIMENT_STANDARD = 8;
const TAILLE_LOT = 200;

const EXCEPTIONS_NOVA4 = [
  'isolat-de-soja',
  'cola-sucre',
  'lecithine-de-soja',
];

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

  return aliments.filter(
    (a) => [1, 2, 3].includes(a.niveau_nova) || EXCEPTIONS_NOVA4.includes(a.slug)
  );
}

async function recupererLotDuJour(tousLesAliments) {
  const { data: etat, error } = await supabase
    .from('etat_import')
    .select('id, dernier_offset')
    .limit(1)
    .single();

  if (error || !etat) {
    throw new Error(`Erreur récupération etat_import: ${error?.message || 'ligne introuvable'}`);
  }

  const total = tousLesAliments.length;
  const offset = etat.dernier_offset % total;

  let lot = tousLesAliments.slice(offset, offset + TAILLE_LOT);
  if (lot.length < TAILLE_LOT) {
    const manquant = TAILLE_LOT - lot.length;
    lot = lot.concat(tousLesAliments.slice(0, manquant));
  }

  const prochainOffset = (offset + TAILLE_LOT) % total;

  return { lot, etatId: etat.id, offset, prochainOffset, total };
}

async function sauvegarderProchainOffset(etatId, prochainOffset) {
  const { error } = await supabase
    .from('etat_import')
    .update({ dernier_offset: prochainOffset })
    .eq('id', etatId);

  if (error) {
    console.log(`Erreur sauvegarde curseur:`, error.message);
  }
}
 
async function chercherEtudesEuropePMC(terme) {
  const motsClefs = terme
    .split(' ')
    .map((mot) => `(TITLE:"${mot}" OR ABSTRACT:"${mot}")`)
    .join(' AND ');
  const requete = `(${motsClefs}) AND (SRC:MED) AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial") sort_date:y`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${PAGE_SIZE_MAX}&resultType=core`;
 
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
  const data = await res.json();
  return {
    hitCount: data.hitCount || 0,
    resultats: data.resultList?.result || [],
  };
}
 
async function analyserEtude(titreOriginal, abstractOriginal, nomAliment) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
Cette étude a été trouvée en recherchant des publications sur : ${nomAliment}
 
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
 
Étape 1 — Vérifie le SUJET :
L'étude parle-t-elle vraiment et spécifiquement de « ${nomAliment} » (ou d'un synonyme/nom scientifique direct de cet aliment) ? Une simple co-occurrence de mots-clés ou une confusion terminologique (ex : un homonyme, une espèce différente, un aliment qui n'apparaît que dans la bibliographie ou en comparaison lointaine) ne compte pas. Si l'étude porte en réalité sur un autre sujet qui a seulement été mal indexé sous ce terme de recherche, réponds "false".
 
Étape 2 — Évalue la pertinence humaine :
Cette étude mesure-t-elle un EFFET ou un BÉNÉFICE (sur la santé, une maladie, un marqueur biologique...) directement chez des sujets HUMAINS, ou via une méta-analyse/revue qui synthétise de tels résultats humains ?
Réponds "false" dans les cas suivants :
- L'étude porte uniquement sur des animaux, des cellules en laboratoire (in vitro), ou des plantes (agronomie, botanique), SANS effet mesuré chez l'humain.
- L'étude décrit seulement l'absorption, le métabolisme ou la biodisponibilité d'un composé chez l'humain (ex : "ce composé est absorbé par l'intestin puis transformé par le microbiote"), mais SANS mesurer un effet ou bénéfice de santé concret chez l'humain. La simple présence de données pharmacocinétiques humaines ne suffit pas si l'effet biologique testé (ex : effet antitumoral, anti-inflammatoire) n'a été observé qu'en laboratoire ou chez l'animal.
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
    throw new Error(`JSON invalide reçu de Claude : ${e.message} | Début du texte reçu : ${nettoye.slice(0, 200)}`);
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

  const { count: nbExistantes } = await supabase
    .from('aliments_etudes')
    .select('*', { count: 'exact', head: true })
    .eq('aliment_id', aliment.id);

  const { hitCount, resultats } = await chercherEtudesEuropePMC(aliment.terme_recherche);

  const alimentRecherche = hitCount >= SEUIL_ALIMENT_RECHERCHE;
  const nbATraiter = alimentRecherche ? NB_RESULTATS_ALIMENT_RECHERCHE : NB_RESULTATS_ALIMENT_STANDARD;

  // Déduplication défensive : Europe PMC peut renvoyer le même article deux fois
  // dans une même page de résultats.
  const dejaVusDansCeLot = new Set();
  const resultatsUniques = resultats.filter((etude) => {
    const sourceId = etude.id || etude.pmid;
    if (!sourceId || dejaVusDansCeLot.has(sourceId)) return false;
    dejaVusDansCeLot.add(sourceId);
    return true;
  });

  const resultatsATraiter = resultatsUniques.slice(0, nbATraiter);

  console.log(`  ${nbExistantes || 0} études déjà en base. ${hitCount} études sérieuses au total sur Europe PMC (aliment ${alimentRecherche ? 'très recherché' : 'standard'}, on traite ${resultatsATraiter.length} résultats).`);
 
  for (const etude of resultatsATraiter) {
    const sourceId = etude.id || etude.pmid;
    if (!sourceId) continue;
 
    const { data: existant } = await supabase
      .from('etudes')
      .select('id')
      .eq('source', 'Europe PMC')
      .eq('source_id', sourceId)
      .maybeSingle();
 
    if (existant) {
      // L'étude existe déjà (trouvée par un autre aliment) : on la relie
      // simplement à cet aliment-ci si ce n'est pas déjà fait.
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
 
      console.log(`  - Ajoutée (${niveauFiabilite || 'fiabilité inconnue'}) : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }
}
 
async function main() {
  const tousLesAliments = await recupererAlimentsATraiter();
  console.log(`${tousLesAliments.length} aliments éligibles au total (NOVA 1/2/3 + exceptions, terme_recherche non vide).`);

  const { lot, etatId, offset, prochainOffset, total } = await recupererLotDuJour(tousLesAliments);
  console.log(`Lot de ce run : ${lot.length} aliments (offset ${offset}/${total}). Prochain offset : ${prochainOffset}.`);

  for (const aliment of lot) {
    try {
      await traiterAliment(aliment);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
    }
  }

  await sauvegarderProchainOffset(etatId, prochainOffset);
  console.log('\nTerminé.');
}
 
main();
 
main();
 
