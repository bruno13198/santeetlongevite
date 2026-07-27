// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, et enregistre tout dans Supabase.

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

const MAX_ETUDES_PAR_ALIMENT = 8;

async function chercherEtudesEuropePMC(terme) {
  const requete = `(${terme}) AND (nutrition OR health OR disease) AND (SRC:MED)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${MAX_ETUDES_PAR_ALIMENT}&resultType=core`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
  const data = await res.json();
  return data.resultList?.result || [];
}

async function genererResumes(titreOriginal, abstractOriginal) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.

Voici une étude scientifique :
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}

Réponds UNIQUEMENT avec un objet JSON valide (rien avant, rien après), au format exact suivant :
{
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
      max_tokens: 1000,
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
  return JSON.parse(nettoye);
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
  console.log(`  ${resultats.length} études trouvées sur Europe PMC.`);

  for (const etude of resultats) {
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
      const resumes = await genererResumes(etude.title, etude.abstractText);

      const { data: nouvelleEtude, error: erreurInsert } = await supabase
        .from('etudes')
        .insert({
          titre_original: etude.title,
          titre_traduit: resumes.titre_traduit,
          source: 'Europe PMC',
          source_id: sourceId,
          url_originale: `https://europepmc.org/article/MED/${sourceId}`,
          date_publication: etude.firstPublicationDate || null,
          auteurs: etude.authorString || null,
          resume_original: etude.abstractText,
          resume_simplifie: resumes.resume_simplifie,
          resume_reformule: resumes.resume_reformule,
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

      console.log(`  - Ajoutée : ${resumes.titre_traduit}`);
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
