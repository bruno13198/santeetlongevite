// Script ponctuel : complète type_etude et nb_participants pour les études
// importées avant l'ajout de ces deux colonnes.
// - nb_participants est extrait localement depuis resume_original (déjà en base, pas d'appel réseau).
// - type_etude nécessite de re-interroger Europe PMC par source_id (pubTypeList jamais stocké).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normaliserTypeEtude(pubTypeList) {
  if (!pubTypeList || pubTypeList.length === 0) return null;
  const types = pubTypeList.map((t) => t.toLowerCase());

  if (types.includes('meta-analysis')) return 'Méta-analyse';
  if (types.includes('systematic review')) return 'Revue systématique';
  if (types.includes('randomized controlled trial')) return 'Essai contrôlé randomisé';
  if (types.includes('clinical trial')) return 'Essai clinique';
  if (types.some((t) => t.includes('cohort'))) return 'Étude de cohorte';
  if (types.some((t) => t.includes('case-control'))) return 'Étude cas-témoins';
  if (types.some((t) => t.includes('cross-sectional') || t.includes('observational'))) return 'Étude transversale';
  if (types.some((t) => t.includes('comparative study'))) return 'Étude comparative';
  if (types.includes('review')) return 'Revue narrative';
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

async function recupererPubType(sourceId, tentative = 1) {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:${sourceId}%20AND%20SRC:MED&format=json&resultType=core`;
  const res = await fetch(url);

  const ERREURS_TEMPORAIRES = [500, 502, 503, 504];
  if (!res.ok) {
    if (ERREURS_TEMPORAIRES.includes(res.status) && tentative < 3) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return recupererPubType(sourceId, tentative + 1);
    }
    throw new Error(`Europe PMC erreur ${res.status}`);
  }

  const data = await res.json();
  const resultat = data.resultList?.result?.[0];
  return resultat?.pubTypeList?.pubType || null;
}

async function main() {
  // Étape 1 : nb_participants, purement local, aucun appel réseau
  console.log('=== Étape 1 : extraction locale de nb_participants ===');
  const { data: etudesSansParticipants, error: err1 } = await supabase
    .from('etudes')
    .select('id, resume_original')
    .is('nb_participants', null)
    .not('resume_original', 'is', null);

  if (err1) throw new Error(`Erreur récupération: ${err1.message}`);
  console.log(`${etudesSansParticipants.length} études à traiter pour nb_participants.`);

  let compteParticipants = 0;
  for (const etude of etudesSansParticipants) {
    const nb = extraireNbParticipants(etude.resume_original);
    if (nb) {
      const { error } = await supabase
        .from('etudes')
        .update({ nb_participants: nb })
        .eq('id', etude.id);
      if (!error) {
        compteParticipants++;
        if (compteParticipants % 100 === 0) console.log(`  ${compteParticipants} mis à jour...`);
      }
    }
  }
  console.log(`Étape 1 terminée : ${compteParticipants} études mises à jour avec nb_participants.\n`);

  // Étape 2 : type_etude, nécessite un appel Europe PMC par étude
  console.log('=== Étape 2 : récupération de type_etude via Europe PMC ===');
  const { data: etudesSansType, error: err2 } = await supabase
    .from('etudes')
    .select('id, source_id')
    .is('type_etude', null)
    .not('source_id', 'is', null);

  if (err2) throw new Error(`Erreur récupération: ${err2.message}`);
  console.log(`${etudesSansType.length} études à traiter pour type_etude.`);

  let compteType = 0;
  let erreurs = 0;
  for (const etude of etudesSansType) {
    try {
      const pubTypeList = await recupererPubType(etude.source_id);
      const type = normaliserTypeEtude(pubTypeList);
      if (type) {
        const { error } = await supabase
          .from('etudes')
          .update({ type_etude: type })
          .eq('id', etude.id);
        if (!error) {
          compteType++;
          if (compteType % 100 === 0) console.log(`  ${compteType} mis à jour...`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200)); // pause pour ne pas saturer Europe PMC
    } catch (e) {
      erreurs++;
      console.log(`  Erreur pour l'étude ${etude.source_id}: ${e.message}`);
    }
  }
  console.log(`Étape 2 terminée : ${compteType} études mises à jour avec type_etude (${erreurs} erreurs).`);

  console.log('\nTerminé.');
}

main();
