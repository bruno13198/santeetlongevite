
// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, et enregistre tout dans Supabase.
// Le filtrage "humain / pertinent" est fait par Claude lui-même, en lisant le résumé
// (plus fiable que les tags MeSH, qui manquent souvent sur les articles récents).
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
// --- Lot 2 : les 5 aliments pilotes d'hier + 30 aliments courants/populaires supplémentaires ---
const ALIMENTS_PILOTE = [
  { slug: 'curcuma-poudre', terme: 'turmeric curcumin' },
  { slug: 'ail-cru', terme: 'garlic Allium sativum' },
  { slug: 'saumon-elevage-cru', terme: 'salmon Salmo salar' },
  { slug: 'myrtille-crue', terme: 'blueberry Vaccinium' },
  { slug: 'brocoli-cru', terme: 'broccoli Brassica oleracea' },
  { slug: 'gingembre-poudre', terme: 'ginger Zingiber officinale' },
  { slug: 'cannelle-poudre', terme: 'cinnamon Cinnamomum' },
  { slug: 'romarin-frais', terme: 'rosemary Rosmarinus officinalis' },
  { slug: 'avocat-chair-sans-peau-sans-noyau-cru', terme: 'avocado Persea americana' },
  { slug: 'fraise-crue', terme: 'strawberry Fragaria' },
  { slug: 'framboise-crue', terme: 'raspberry Rubus idaeus' },
  { slug: 'grenade-chair-sans-peau-avec-pepins-crue', terme: 'pomegranate Punica granatum' },
  { slug: 'citron-vert-ou-lime-chair-sans-peau-sans-pepins-cru', terme: 'lime Citrus aurantifolia' },
  { slug: 'raisin-noir-cru', terme: 'grape Vitis vinifera' },
  { slug: 'epinard-cru', terme: 'spinach Spinacia oleracea' },
  { slug: 'oignon-cru', terme: 'onion Allium cepa' },
  { slug: 'patate-douce-crue', terme: 'sweet potato Ipomoea batatas' },
  { slug: 'tomate-sans-precision-crue-aliment-moyen', terme: 'tomato Solanum lycopersicum' },
  { slug: 'avoine-crue', terme: 'oat Avena sativa' },
  { slug: 'quinoa-cru', terme: 'quinoa Chenopodium quinoa' },
  { slug: 'lentille-verte-seche', terme: 'lentil Lens culinaris' },
  { slug: 'noix-cerneau-sechee', terme: 'walnut Juglans regia' },
  { slug: 'amande-grillee-salee', terme: 'almond Prunus dulcis' },
  { slug: 'noix-de-cajou-grillee-salee', terme: 'cashew Anacardium occidentale' },
  { slug: 'pistache-grillee-salee', terme: 'pistachio Pistacia vera' },
  { slug: 'noix-du-bresil-ou-noix-d-amazonie-sans-sel-ajoute', terme: 'Brazil nut Bertholletia excelsa' },
  { slug: 'noix-de-macadamia-grillee-salee', terme: 'macadamia nut' },
  { slug: 'noix-de-coco-chair-seche', terme: 'coconut Cocos nucifera' },
  { slug: 'sardine-crue', terme: 'sardine fish omega-3' },
  { slug: 'maquereau-cru', terme: 'mackerel fish omega-3' },
  { slug: 'hareng-cru', terme: 'herring fish omega-3' },
  { slug: 'kefir-de-lait', terme: 'kefir fermented milk' },
  { slug: 'yaourt-a-la-grecque-nature', terme: 'Greek yogurt' },
  { slug: 'huile-d-olive-vierge-extra', terme: 'extra virgin olive oil' },
  { slug: 'miel', terme: 'honey human health nutrition' },
  { slug: 'cafe-moulu', terme: 'coffee Coffea arabica' },
  { slug: 'chocolat-noir-70-de-cacao-environ-de-degustation-tablette', terme: 'dark chocolate cocoa flavanols' },
  { slug: 'vinaigre-de-cidre', terme: 'apple cider vinegar' },
  { slug: 'spiruline-spirulina-sp-sechee-ou-deshydratee', terme: 'spirulina Arthrospira' },
  { slug: 'chou-kale-cru', terme: 'kale Brassica oleracea acephala' },
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
 
  const { data: alimentDB, error: erreurAliment } = await supabase
    .from('aliments')
    .select('id')
    .eq('slug', aliment.slug)
    .single();
 
  if (erreurAliment || !alimentDB) {
    console.log(`  Aliment introuvable en base, on saute.`);
    return;
  }
 
  // On vérifie combien d'études existent déjà pour cet aliment, pour éviter
  // d'appeler inutilement l'API si le quota est déjà atteint.
  const { count: nbExistantes } = await supabase
    .from('aliments_etudes')
    .select('*', { count: 'exact', head: true })
    .eq('aliment_id', alimentDB.id);
 
  if ((nbExistantes || 0) >= MAX_ETUDES_PAR_ALIMENT) {
    console.log(`  Déjà ${nbExistantes} études en base (quota ${MAX_ETUDES_PAR_ALIMENT} atteint), on saute — aucun appel API.`);
    return;
  }
 
  const resultats = await chercherEtudesEuropePMC(aliment.terme);
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
 
    try {
      const analyse = await analyserEtude(etude.title, etude.abstractText, aliment.terme);
 
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
 
main();
