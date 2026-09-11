// Script d'audit : détecte les études déjà en base dont l'attribution à un
// aliment est en réalité non pertinente, parce que le filtre de pertinence
// d'origine (analyserEtude) vérifiait la pertinence par rapport à
// aliment.terme_recherche (souvent composite, ex: "mackerel fish omega-3")
// plutôt qu'à aliment.nom — cas trouvé et corrigé le 10 sept. 2026 (maquereau).
// Cible uniquement les aliments à terme_recherche composite (>=2 mots),
// seuls exposés au bug. Découpe en 10 lots via LOT_ACTUEL (0 à 9).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NB_LOTS = 10;
const LOT_ACTUEL = parseInt(process.env.LOT_ACTUEL || '0', 10);

async function jugerPertinence(nomAliment, titre, resume, tentative = 1) {
  const prompt = `Tu es un rédacteur scientifique qui vérifie la pertinence d'études de nutrition pour un site grand public francophone.

Aliment concerné : ${nomAliment}
Titre de l'étude : ${titre}
Résumé : ${resume}

Question : cette étude porte-t-elle réellement sur « ${nomAliment} » consommé comme aliment, de façon suffisamment centrale pour justifier de l'associer à cette fiche ?

Réponds "false" (non pertinent) si, par exemple :
- l'étude porte sur un aliment différent ou une espèce différente (ex: un autre poisson, un autre type d'épinard)
- l'étude porte sur un complément alimentaire isolé ou un mélange de compléments, pas sur l'aliment lui-même
- l'aliment n'est mentionné qu'incidemment dans une étude qui porte principalement sur autre chose (ex: revue générale sur les compléments multivitaminés)
- l'étude ne porte pas sur la consommation alimentaire de cet aliment au sens propre

Réponds "true" si l'étude porte bien, de façon substantielle, sur la consommation de « ${nomAliment} » tel quel.

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"pertinent": true, "raison": "brève justification en français"}
ou
{"pertinent": false, "raison": "brève justification en français"}`;

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
    if (typeof resultat.pertinent !== 'boolean') throw new Error('Champ pertinent manquant');
    return resultat;
  } catch (e) {
    if (tentative < 3) {
      console.log(`      Réponse incomplète ("${nettoye}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return jugerPertinence(nomAliment, titre, resume, tentative + 1);
    }
    console.log(`      Échec après 3 tentatives, étude conservée par prudence. Dernière réponse : "${nettoye}"`);
    return { pertinent: true, raison: 'échec du jugement, conservée par prudence' };
  }
}

async function recupererAlimentsATraiter() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, slug, nom, terme_recherche')
    .not('terme_recherche', 'is', null)
    .order('id', { ascending: true });

  if (error) throw new Error(`Erreur récupération aliments: ${error.message}`);

  const composites = aliments.filter(
    (a) => a.terme_recherche.trim().split(/\s+/).length >= 2
  );

  const lot = composites.filter((_, index) => index % NB_LOTS === LOT_ACTUEL);

  return lot;
}

async function traiterAliment(aliment, suppressions) {
  const { data: liens, error } = await supabase
    .from('aliments_etudes')
    .select('etude_id, etudes(id, titre_original, titre_traduit, resume_original, source_id)')
    .eq('aliment_id', aliment.id);

  if (error) {
    console.log(`  Erreur récupération études pour ${aliment.slug}: ${error.message}`);
    return;
  }
  if (!liens || liens.length === 0) return;

  console.log(`\n=== ${aliment.slug} (terme_recherche: "${aliment.terme_recherche}", ${liens.length} études) ===`);

  for (const lien of liens) {
    const etude = lien.etudes;
    if (!etude) continue;

    try {
      const { pertinent, raison } = await jugerPertinence(
        aliment.nom,
        etude.titre_original,
        etude.resume_original
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (pertinent) {
        console.log(`  - OK : ${etude.titre_traduit || etude.titre_original}`);
        continue;
      }

      console.log(`  - NON PERTINENT, retrait : ${etude.titre_traduit || etude.titre_original}`);
      console.log(`    Raison : ${raison}`);

      await supabase
        .from('aliments_etudes')
        .delete()
        .eq('aliment_id', aliment.id)
        .eq('etude_id', etude.id);

      await supabase.from('candidats_rejetes').insert({
        aliment_id: aliment.id,
        source_id: etude.source_id,
      });

      suppressions.push({
        aliment: aliment.nom,
        slug: aliment.slug,
        etude: etude.titre_traduit || etude.titre_original,
        etude_id: etude.id,
        raison,
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
  console.log(`Lot ${LOT_ACTUEL}/${NB_LOTS - 1} : ${aliments.length} aliments à vérifier.`);

  const suppressions = [];

  for (const aliment of aliments) {
    try {
      await traiterAliment(aliment, suppressions);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
    }
  }

  console.log(`\nTerminé. ${suppressions.length} lien(s) supprimé(s) dans ce lot.`);
  if (suppressions.length > 0) {
    console.log('\n=== Récapitulatif des suppressions ===');
    console.log(JSON.stringify(suppressions, null, 2));
  }
}

main();
