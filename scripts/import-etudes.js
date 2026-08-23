// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, et enregistre tout dans Supabase.
// Le filtrage "humain / pertinent" est fait par Claude lui-même, en lisant le résumé
// (plus fiable que les tags MeSH, qui manquent souvent sur les articles récents).
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
// On demande plus de résultats à Europe PMC que nécessaire, car une partie
// sera écartée par le filtre de pertinence humaine (voir plus bas).
const RESULTATS_A_RECUPERER = 20;
const MAX_ETUDES_PAR_ALIMENT = 8;
// Aliments NOVA 4 (ultra-transformés) qu'on choisit quand même de couvrir,
// car leur transformation ou leur usage a une littérature scientifique dédiée.
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
    .neq('terme_recherche', '');

  if (error) {
    throw new Error(`Erreur récupération aliments: ${error.message}`);
  }

  return aliments.filter(
    (a) => [1, 2, 3].includes(a.niveau_nova) || EXCEPTIONS_NOVA4.includes(a.slug)
  );
}
 
async function chercherEtudesEuropePMC(terme) {
  // On cible le titre et le résumé (au lieu du texte complet / mots-clés / affiliations)
  // pour ne récupérer que des études réellement centrées sur l'aliment recherché.
  const motsClefs = terme
    .split(' ')
    .map((mot) => `(TITLE:"${mot}" OR ABSTRACT:"${mot}")`)
    .join(' AND ');
  const requete = `(${motsClefs}) AND (SRC:MED) AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial")`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${RESULTATS_A_RECUPERER}&resultType=core`;
 
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
  const data = await res.json();
  return data.resultList?.result || [];
}
 
async function analyserEtude(titreOriginal, abstractOriginal, nomAliment) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
Cette étude a été trouvée en recherchant des publications sur : ${nomAliment}
 
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
 
Étape 1 — Vérifie le SUJET :
L'étude parle-t-elle vraiment et spécifiquement de « ${nomAliment} » (ou d'un synonyme/nom scientifique direct de cet aliment) ? Une simple co-occurrence de mots-clés ou une confusion terminologique (ex : un homonyme, une espèce différente, un aliment qui n'apparaît que dans la bibliographie ou en comparaison lointaine) ne compte pas. Si l'étude porte en réalité sur un autre sujet qui a seulement été mal indexé sous ce terme de recherche, réponds "false".
 
Étape 2 — Évalue la pertinence humaine :
Cette étude concerne-t-elle la santé, la nutrition ou la physiologie HUMAINE (directement, ou via une méta-analyse/revue qui synthétise des données humaines) ?
Réponds "false" si l'étude porte uniquement sur : des animaux (vétérinaire, élevage, modèles animaux sans lien direct avec la santé humaine), des plantes (agronomie, botanique pure), des microbes/environnement sans lien santé humaine, ou tout autre sujet hors nutrition/santé humaine.
 
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
 
async function traiterAliment(aliment) {
  console.log(`\n=== ${aliment.slug} ===`);

  // Le filtre NOVA 4 est déjà appliqué en amont dans recupererAlimentsATraiter(),
  // donc aliment.niveau_nova est ici garanti être 1/2/3 ou une exception NOVA 4.
 
  // On vérifie combien d'études existent déjà pour cet aliment, pour éviter
  // d'appeler inutilement l'API si le quota est déjà atteint.
  const { count: nbExistantes } = await supabase
    .from('aliments_etudes')
    .select('*', { count: 'exact', head: true })
    .eq('aliment_id', aliment.id);
 
  if ((nbExistantes || 0) >= MAX_ETUDES_PAR_ALIMENT) {
    console.log(`  Déjà ${nbExistantes} études en base (quota ${MAX_ETUDES_PAR_ALIMENT} atteint), on saute — aucun appel API.`);
    return;
  }
 
  const resultats = await chercherEtudesEuropePMC(aliment.terme_recherche);
  console.log(`  ${resultats.length} études trouvées sur Europe PMC (avant filtrage humain).`);
 
  let etudesAjoutees = nbExistantes || 0;
 
  for (const etude of resultats) {
    if (etudesAjoutees >= MAX_ETUDES_PAR_ALIMENT) {
      console.log(`  - Quota de ${MAX_ETUDES_PAR_ALIMENT} atteint, on arrête ici.`);
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
      console.log(`  - Déjà en base (${sourceId}), on passe.`);
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
        })
        .select('id')
        .single();
 
      if (erreurInsert) {
        console.log(`  - Erreur insertion étude ${sourceId}:`, erreurInsert.message);
        continue;
      }
 
      await supabase.from('aliments_etudes').insert({
        aliment_id: aliment.id,
        etude_id: nouvelleEtude.id,
      });
 
      etudesAjoutees++;
      console.log(`  - Ajoutée : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }
}
 
async function main() {
  const aliments = await recupererAlimentsATraiter();
  console.log(`${aliments.length} aliments à traiter (NOVA 1/2/3 + exceptions, terme_recherche non vide).`);

  for (const aliment of aliments) {
    try {
      await traiterAliment(aliment);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
    }
  }
  console.log('\nTerminé.');
}
 
main();
 
main();
 
