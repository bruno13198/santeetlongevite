// Script de génération : attribue un terme de recherche (anglais, pour Europe PMC)
// à chaque aliment déjà en base qui n'en a pas encore.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function genererTerme(nom, tentative = 1) {
  const prompt = `Tu es un expert en nutrition et en recherche scientifique. Pour l'ALIMENT français suivant, donne le meilleur terme de recherche en ANGLAIS à utiliser pour interroger la base de données scientifique Europe PMC (titres et résumés d'études).

Nom de l'aliment : ${nom}

Règles :
- Utilise le nom commun anglais le plus utilisé dans la littérature scientifique nutritionnelle (pas nécessairement le nom scientifique latin, sauf si c'est le terme standard utilisé, ex. "curcumin" pour curcuma)
- Reste concis : un seul terme ou une courte expression (1 à 3 mots), pas de phrase
- Le terme doit être assez spécifique pour éviter le bruit, mais assez commun pour trouver des études existantes

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"terme": "garlic"}`;

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
    if (!resultat.terme) throw new Error('Champ terme manquant');
    return resultat.terme.trim();
  } catch (e) {
    if (tentative < 3) {
      console.log(`    Réponse incomplète ("${nettoye}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return genererTerme(nom, tentative + 1);
    }
    console.log(`    Échec après 3 tentatives. Dernière réponse reçue : "${nettoye}"`);
    throw e;
  }
}

async function main() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom')
    .or('terme_recherche.is.null,terme_recherche.eq.');

  if (error) {
    console.log('Erreur récupération aliments:', error.message);
    return;
  }

  console.log(`${aliments.length} aliments à traiter.`);

  for (const aliment of aliments) {
    try {
      const terme = await genererTerme(aliment.nom);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { error: erreurUpdate } = await supabase
        .from('aliments')
        .update({ terme_recherche: terme })
        .eq('id', aliment.id);

      if (erreurUpdate) {
        console.log(`  - Erreur mise à jour aliment ${aliment.id}:`, erreurUpdate.message);
        continue;
      }

      console.log(`  - ${aliment.nom} : "${terme}"`);
    } catch (e) {
      console.log(`  - Erreur traitement aliment ${aliment.id}:`, e.message);
    }
  }

  console.log('\nTerminé.');
}

main();
