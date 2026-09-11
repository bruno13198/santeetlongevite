// Script d'audit de pertinence des liaisons aliment ↔ étude.
// Fait suite au bug du 10 sept. 2026 (analyserEtude jugeait la pertinence
// par rapport à terme_recherche au lieu de aliment.nom).
//
// Trois verdicts possibles :
//   - pertinent  : lien conservé
//   - hors_sujet : lien retiré (usage topique, ou aucun rapport réel)
//   - ambigu     : lien CONSERVÉ, signalé pour arbitrage manuel
//
// Les extraits / composés isolés issus de l'aliment et INGÉRÉS sont
// considérés comme pertinents (ex : curcumine sur la fiche curcuma).
// Les études ne sont jamais supprimées de la table `etudes`, seulement déliées.
//
// Variables d'environnement :
//   LOT_ACTUEL      : 0 à 9 (défaut 0) — découpe les aliments composites en 10 lots
//   MODE_SIMULATION : 'true' (défaut) = aucune écriture en base, rapport seul
//                     'false' = applique réellement les retraits hors_sujet

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NB_LOTS = 10;
const LOT_ACTUEL = parseInt(process.env.LOT_ACTUEL || '0', 10);
const MODE_SIMULATION = (process.env.MODE_SIMULATION || 'true') !== 'false';

async function jugerPertinence(nomAliment, titre, resume, tentative = 1) {
  const prompt = `Tu vérifies si une étude scientifique est correctement rattachée à la fiche d'un aliment, sur un site de nutrition fondé sur les preuves.

Aliment de la fiche : ${nomAliment}
Titre de l'étude : ${titre}
Résumé : ${resume}

Classe ce rattachement dans UNE de ces trois catégories :

"pertinent" — l'étude apporte une information utile sur « ${nomAliment} ». Cela inclut :
- l'étude porte sur l'aliment lui-même, consommé tel quel
- l'étude porte sur un extrait, un composé isolé, une huile ou une préparation ISSUE de cet aliment et INGÉRÉE (ex : curcumine pour le curcuma, huile de foie de morue pour le foie de morue, peptides de chia pour la graine de chia)
- l'étude porte sur l'aliment sous une forme ou une variante voisine, ou sur la catégorie étroite à laquelle il appartient, lorsque c'est la littérature la plus proche disponible (ex : une étude sur « lait écrémé » pour une fiche « lait écrémé UHT » ; une étude sur les fromages à pâte molle pour un fromage à pâte molle précis)
- des détails de procédé secondaires (UHT, séché, moulu, cru vs cuit) ne suffisent PAS à rendre une étude non pertinente, sauf si l'étude porte précisément sur ce paramètre et conclut à une différence

"hors_sujet" — l'étude n'a pas de rapport exploitable avec « ${nomAliment} ». Notamment :
- l'exposition étudiée est une APPLICATION TOPIQUE, CUTANÉE, COSMÉTIQUE ou externe (crème, gel, lotion, spray nasal, pansement), et non une ingestion
- l'étude porte sur un aliment, une espèce ou un produit réellement différent, sans lien de parenté utile
- l'aliment n'apparaît pas du tout dans l'étude, ou seulement par confusion de terminologie

"ambigu" — cas intermédiaire que tu ne peux pas trancher avec certitude. Notamment :
- « ${nomAliment} » n'est qu'un élément parmi de nombreux autres dans une revue large (ex : une revue sur vingt épices, une revue sur tous les produits laitiers fermentés), sans résultat qui lui soit propre
- l'aliment sert de simple véhicule à autre chose (ex : un nutriment ajouté, un médicament, un protocole clinique)
- tu hésites entre "pertinent" et "hors_sujet"

En cas de doute, réponds "ambigu" plutôt que "hors_sujet" : un lien retiré à tort est une perte, un lien ambigu sera arbitré par un humain.

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"verdict": "pertinent", "raison": "une phrase courte en français"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
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
    const verdicts = ['pertinent', 'hors_sujet', 'ambigu'];
    if (!verdicts.includes(resultat.verdict)) throw new Error('Verdict invalide');
    return resultat;
  } catch (e) {
    if (tentative < 3) {
      console.log(`      Réponse incomplète, nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return jugerPertinence(nomAliment, titre, resume, tentative + 1);
    }
    console.log(`      Échec après 3 tentatives, lien conservé par prudence.`);
    return { verdict: 'pertinent', raison: 'échec du jugement, conservé par prudence' };
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

  return composites.filter((_, index) => index % NB_LOTS === LOT_ACTUEL);
}

async function traiterAliment(aliment, rapport) {
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

    const titre = etude.titre_traduit || etude.titre_original;

    try {
      const { verdict, raison } = await jugerPertinence(
        aliment.nom,
        etude.titre_original,
        etude.resume_original
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (verdict === 'pertinent') {
        console.log(`  - OK : ${titre}`);
        continue;
      }

      if (verdict === 'ambigu') {
        console.log(`  - AMBIGU (conservé, à arbitrer) : ${titre}`);
        console.log(`    Raison : ${raison}`);
        rapport.ambigus.push({
          aliment: aliment.nom,
          slug: aliment.slug,
          aliment_id: aliment.id,
          etude_id: etude.id,
          etude: titre,
          raison,
        });
        continue;
      }

      // verdict === 'hors_sujet'
      console.log(`  - HORS SUJET${MODE_SIMULATION ? ' (simulation, rien supprimé)' : ', retrait'} : ${titre}`);
      console.log(`    Raison : ${raison}`);

      rapport.horsSujet.push({
        aliment: aliment.nom,
        slug: aliment.slug,
        aliment_id: aliment.id,
        etude_id: etude.id,
        etude: titre,
        raison,
      });

      if (!MODE_SIMULATION) {
        await supabase
          .from('aliments_etudes')
          .delete()
          .eq('aliment_id', aliment.id)
          .eq('etude_id', etude.id);

        await supabase.from('candidats_rejetes').insert({
          aliment_id: aliment.id,
          source_id: etude.source_id,
        });
      }
    } catch (e) {
      console.log(`  - Erreur sur étude ${etude.id}:`, e.message);
    }
  }
}

async function main() {
  const aliments = await recupererAlimentsATraiter();
  console.log(
    `Lot ${LOT_ACTUEL}/${NB_LOTS - 1} — ${aliments.length} aliments à vérifier.` +
    (MODE_SIMULATION ? ' MODE SIMULATION : aucune écriture en base.' : ' MODE RÉEL : les liens hors sujet seront retirés.')
  );

  const rapport = { horsSujet: [], ambigus: [] };

  for (const aliment of aliments) {
    try {
      await traiterAliment(aliment, rapport);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
    }
  }

  console.log(`\n===== RAPPORT LOT ${LOT_ACTUEL} =====`);
  console.log(`Hors sujet : ${rapport.horsSujet.length}${MODE_SIMULATION ? ' (non retirés, simulation)' : ' (retirés)'}`);
  console.log(`Ambigus à arbitrer : ${rapport.ambigus.length} (tous conservés)`);

  if (rapport.ambigus.length > 0) {
    console.log('\n--- Cas ambigus ---');
    console.log(JSON.stringify(rapport.ambigus, null, 2));
  }
  if (rapport.horsSujet.length > 0) {
    console.log('\n--- Cas hors sujet ---');
    console.log(JSON.stringify(rapport.horsSujet, null, 2));
  }
}

main();
