// Tri ponctuel des études classées « Revue narrative » (niveau 5) entre revue narrative
// (synthèse de résultats humains) et revue mécanistique (mécanismes étudiés sur cellules
// ou animaux). Modèle léger (Haiku) : question simple, coût minimal.
// Ne traite que les études non encore vérifiées (revue_verifiee = false) : peut être relancé.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LIMITE = parseInt(process.env.LIMITE || '2000', 10);
const MODELE_TRI = 'claude-haiku-4-5-20251001';
const DELAI_MAX_MS = 60000;
const TAILLE_PAGE = 200;

async function appelerClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELE_TRI,
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  if (!res.ok) throw new Error(`Erreur API Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('');
}

async function determinerType(titre, resume, tentative = 1) {
  const prompt = `Voici une revue de la littérature scientifique (non systématique).

Titre : ${titre}
Résumé : ${resume}

Indique sur quoi porte ESSENTIELLEMENT cette revue :
- "humain" : elle synthétise surtout des résultats obtenus chez l'humain (essais cliniques, études épidémiologiques, observations chez des patients ou des populations) ;
- "mecanistique" : elle porte surtout sur des mécanismes biologiques (voies moléculaires, effets cellulaires, inflammation, stress oxydatif…) étudiés principalement sur des cellules ou chez l'animal.
Si la revue mélange les deux, choisis ce qui domine dans le résumé.

Réponds UNIQUEMENT avec un objet JSON : {"type": "humain"} ou {"type": "mecanistique"}`;

  let texte = '';
  try {
    texte = await appelerClaude(prompt);
    const match = texte.match(/\{[\s\S]*\}/);
    const objet = JSON.parse(match ? match[0] : texte);
    if (objet.type !== 'humain' && objet.type !== 'mecanistique') throw new Error('Type inattendu');
    return objet.type;
  } catch (e) {
    if (tentative < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * tentative));
      return determinerType(titre, resume, tentative + 1);
    }
    console.log(`  Échec après 3 tentatives (${e.message.slice(0, 80)}) : "${texte.slice(0, 80)}"`);
    return null;
  }
}

async function main() {
  const compteurs = { humain: 0, mecanistique: 0, echecs: 0 };
  const idsIgnores = new Set();
  console.log(`Tri des revues narratives : LIMITE=${LIMITE}`);

  while (compteurs.humain + compteurs.mecanistique + compteurs.echecs < LIMITE) {
    const { data: page, error } = await supabase
      .from('etudes')
      .select('id, titre_original, resume_original')
      .eq('design_etude', 'Revue narrative')
      .eq('revue_verifiee', false)
      .order('id', { ascending: true })
      .limit(TAILLE_PAGE + idsIgnores.size);

    if (error) throw new Error(`Erreur lecture études : ${error.message}`);

    const aTraiter = (page || []).filter((e) => !idsIgnores.has(e.id));
    if (aTraiter.length === 0) {
      console.log('\nPlus aucune revue à trier.');
      break;
    }

    for (const etude of aTraiter) {
      if (compteurs.humain + compteurs.mecanistique + compteurs.echecs >= LIMITE) break;

      const type = etude.resume_original
        ? await determinerType(etude.titre_original, etude.resume_original)
        : null;

      if (!type) {
        compteurs.echecs++;
        idsIgnores.add(etude.id);
        continue;
      }

      const miseAJour = { revue_verifiee: true };
      if (type === 'mecanistique') miseAJour.design_etude = 'Revue mécanistique';

      const { error: erreurMaj } = await supabase.from('etudes').update(miseAJour).eq('id', etude.id);
      if (erreurMaj) {
        console.log(`  Erreur mise à jour ${etude.id} : ${erreurMaj.message}`);
        compteurs.echecs++;
        idsIgnores.add(etude.id);
        continue;
      }

      compteurs[type]++;
      const libelle = type === 'mecanistique' ? 'MÉCANISTIQUE' : 'narrative  ';
      console.log(`  ${libelle} : ${etude.titre_original.slice(0, 110)}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log(`\nTerminé. Narratives (humain) : ${compteurs.humain}, mécanistiques : ${compteurs.mecanistique}, échecs : ${compteurs.echecs}.`);
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
