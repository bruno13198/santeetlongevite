// Script de rattrapage : détecte les études déjà en base qui portent en
// réalité sur un usage TOPIQUE/CUTANÉ/COSMÉTIQUE d'un aliment (crème, gel,
// gant enduit...) plutôt que sur sa consommation alimentaire, et les retire.
// Corrige un trou du filtre analyserEtude (voir historique : avoine colloïdale).
// Traite les aliments un par un (SLUGS_CIBLES optionnel pour cibler un lot).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEPTIONS_NOVA4 = [
  'isolat-de-soja',
  'cola-sucre',
  'lecithine-de-soja',
  'kimchi',
  'kombucha',
];

async function jugerUsageTopique(nomAliment, titre, resume, tentative = 1) {
  const prompt = `Tu es un rédacteur scientifique qui vérifie la pertinence d'études de nutrition pour un site grand public francophone.

Aliment concerné : ${nomAliment}
Titre de l'étude : ${titre}
Résumé : ${resume}

Question : cette étude évalue-t-elle un usage TOPIQUE, CUTANÉ ou COSMÉTIQUE de « ${nomAliment} » (crème, gel, lotion, gant enduit, application sur la peau, shampoing...), PLUTÔT qu'une CONSOMMATION ALIMENTAIRE (ingestion orale) ?

Réponds "true" uniquement si l'exposition étudiée est une application externe/cutanée et non une ingestion. Si l'aliment est consommé par voie orale (même en tant qu'ingrédient d'un repas test, d'un produit alimentaire ou d'un régime), réponds "false".

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"usage_topique": true}
ou
{"usage_topique": false}`;

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
    if (typeof resultat.usage_topique !== 'boolean') throw new Error('Champ usage_topique manquant');
    return resultat.usage_topique;
  } catch (e) {
    if (tentative < 3) {
      console.log(`      Réponse incomplète ("${nettoye}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return jugerUsageTopique(nomAliment, titre, resume, tentative + 1);
    }
    console.log(`      Échec après 3 tentatives, étude conservée par prudence. Dernière réponse : "${nettoye}"`);
    return false; // en cas de doute persistant, on ne supprime pas
  }
}

async function recupererAlimentsATraiter() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, slug, nom, niveau_nova')
    .order('id', { ascending: true });

  if (error) throw new Error(`Erreur récupération aliments: ${error.message}`);

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

async function traiterAliment(aliment) {
  const { data: liens, error } = await supabase
    .from('aliments_etudes')
    .select('etude_id, etudes(id, titre_original, titre_traduit, resume_original, source_id)')
    .eq('aliment_id', aliment.id);

  if (error) {
    console.log(`  Erreur récupération études pour ${aliment.slug}: ${error.message}`);
    return;
  }
  if (!liens || liens.length === 0) return;

  console.log(`\n=== ${aliment.slug} (${liens.length} études) ===`);

  for (const lien of liens) {
    const etude = lien.etudes;
    if (!etude) continue;

    try {
      const estTopique = await jugerUsageTopique(
        aliment.nom,
        etude.titre_original,
        etude.resume_original
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (!estTopique) {
        console.log(`  - OK (alimentaire) : ${etude.titre_traduit || etude.titre_original}`);
        continue;
      }

      console.log(`  - USAGE TOPIQUE détecté, retrait : ${etude.titre_traduit || etude.titre_original}`);

      await supabase
        .from('aliments_etudes')
        .delete()
        .eq('aliment_id', aliment.id)
        .eq('etude_id', etude.id);

      await supabase.from('candidats_rejetes').insert({
        aliment_id: aliment.id,
        source_id: etude.source_id,
      });

      const { count } = await supabase
        .from('aliments_etudes')
        .select('*', { count: 'exact', head: true })
        .eq('etude_id', etude.id);

      if (count === 0) {
        await supabase.from('etudes').delete().eq('id', etude.id);
        console.log(`    (étude orpheline, supprimée de la base)`);
      }
    } catch (e) {
      console.log(`  - Erreur sur étude ${etude.id}:`, e.message);
    }
  }
}

async function main() {
  const aliments = await recupererAlimentsATraiter();
  console.log(`${aliments.length} aliments à vérifier.`);

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
