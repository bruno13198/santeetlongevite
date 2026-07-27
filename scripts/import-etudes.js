// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, et enregistre tout dans Supabase.
// Le filtrage "humain / pertinent" est fait par Claude lui-même, en lisant le résumé
// (plus fiable que les tags MeSH, qui manquent souvent sur les articles récents).
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
// --- Phase pilote : 5 aliments de test, avec leur terme de recherche scientifique/anglais ---
const ALIMENTS_PILOTE = [
  { slug: 'curcuma-poudre', terme: 'turmeric curcumin' },
  { slug: 'ail-cru', terme: 'garlic Allium sativum' },
  { slug: 'saumon-elevage-cru', terme: 'salmon Salmo salar' },
  { slug: 'myrtille-crue', terme: 'blueberry Vaccinium' },
  { slug: 'brocoli-cru', terme: 'broccoli Brassica oleracea' },
];
 
// On demande plus de résultats à Europe PMC que nécessaire, car une partie
// sera écartée par le filtre de pertinence humaine (voir plus bas).
const RESULTATS_A_RECUPERER = 20;
const MAX_ETUDES_PAR_ALIMENT = 8;
 
async function chercherEtudesEuropePMC(terme) {
  const requete = `(${terme}) AND (SRC:MED) AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial")`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${RESULTATS_A_RECUPERER}&resultType=core`;
 
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
  const data = await res.json();
  return data.resultList?.result || [];
}
 
async function analyserEtude(titreOriginal, abstractOriginal) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
Voici une étude scientifique :
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
 
Étape 1 — Évalue la pertinence :
Cette étude concerne-t-elle la santé, la nutrition ou la physiologie HUMAINE (directement, ou via une méta-analyse/revue qui synthétise des données humaines) ?
Réponds "false" si l'étude porte uniquement sur : des animaux (vétérinaire, élevage, modèles animaux sans lien direct avec la santé humaine), des plantes (agronomie, botanique pure), des microbes/environnement sans lien santé humaine, ou tout autre sujet hors nutrition/santé humaine.
 
Étape 2 — Si et seulement si pertinent, rédige les résumés en français.
 
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
 
  const { data: alimentDB, error: erreurAliment } = await supabase
    .from('aliments')
    .select('id')
    .eq('slug', aliment.slug)
    .single();
 
  if (erreurAliment || !alimentDB) {
    console.log(`  Aliment introuvable en base, on saute.`);
    return;
  }
 
  const resultats = await chercherEtudesEuropePMC(aliment.terme);
  console.log(`  ${resultats.length} études trouvées sur Europe PMC (avant filtrage humain).`);
 
  let etudesAjoutees = 0;
 
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
 
    try {
      const analyse = await analyserEtude(etude.title, etude.abstractText);
 
      if (!analyse.pertinent) {
        console.log(`  - Écartée (${sourceId}) : ${analyse.raison}`);
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
        aliment_id: alimentDB.id,
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
  for (const aliment of ALIMENTS_PILOTE) {
    try {
      await traiterAliment(aliment);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
    }
  }
  console.log('\nTerminé.');
}
 
main();
