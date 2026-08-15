// Script de classement rétroactif : attribue un niveau de fiabilité
// (haute / modérée / préliminaire) à chaque étude déjà en base,
// à partir de son titre et de son résumé original.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function classerEtude(titre, resumeOriginal, tentative = 1) {
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
  if (!data.content || data.content.length === 0) {
    console.log(`    Réponse API complète : ${JSON.stringify(data)}`);
  }
  const texte = data.content.map((b) => b.text || '').join('');
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  try {
    const resultat = JSON.parse(match ? match[0] : nettoye);
    if (!resultat.niveau) throw new Error('Champ niveau manquant');
    return resultat.niveau;
  } catch (e) {
    if (tentative < 3) {
      console.log(`    Réponse incomplète ("${nettoye}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return classerEtude(titre, resumeOriginal, tentative + 1);
    }
    console.log(`    Échec après 3 tentatives. Dernière réponse reçue : "${nettoye}"`);
    throw e;
  }
}

async function main() {
  const { data: etudes, error } = await supabase
    .from('etudes')
    .select('id, titre_original, resume_original')
    .is('niveau_fiabilite', null);
  if (error) {
    console.log('Erreur récupération études:', error.message);
    return;
  }
  console.log(`${etudes.length} études à classer.`);
  for (const etude of etudes) {
    try {
      const niveau = await classerEtude(etude.titre_original, etude.resume_original);
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!['haute', 'moderee', 'preliminaire'].includes(niveau)) {
        console.log(`  - Étude ${etude.id} : niveau inattendu reçu (${niveau}), on passe.`);
        continue;
      }
      const { error: erreurUpdate } = await supabase
        .from('etudes')
        .update({ niveau_fiabilite: niveau })
        .eq('id', etude.id);
      if (erreurUpdate) {
        console.log(`  - Erreur mise à jour étude ${etude.id}:`, erreurUpdate.message);
        continue;
      }
      console.log(`  - Étude ${etude.id} classée : ${niveau}`);
    } catch (e) {
      console.log(`  - Erreur traitement étude ${etude.id}:`, e.message);
    }
  }
  console.log('\nTerminé.');
}
main();
