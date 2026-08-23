// Script de classement rétroactif : attribue un niveau NOVA (1 à 4)
// à chaque aliment déjà en base, à partir de son nom.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function classerAliment(nom, tentative = 1) {
  const prompt = `Tu es un nutritionniste spécialisé dans la classification NOVA des aliments selon leur degré de transformation. Classe l'ALIMENT suivant dans une seule des 4 catégories NOVA ci-dessous, en te basant uniquement sur son nom.

Nom de l'aliment : ${nom}

Catégories NOVA :
- 1 : aliment brut ou minimalement transformé (fruits, légumes, viandes crues, poissons crus, œufs, lait, céréales brutes, légumineuses sèches, aliments simplement séchés/surgelés/bouillis sans ajout)
- 2 : ingrédient culinaire transformé (huiles, beurre, sucre, sel, vinaigre, farine, miel — utilisés pour cuisiner, pas consommés seuls)
- 3 : aliment transformé (pain, fromage, conserves simples, produits fumés/salés/en saumure, aliments avec 2-3 ingrédients reconnaissables)
- 4 : aliment ultra-transformé (produits industriels avec additifs, arômes artificiels, produits reconstitués, snacks industriels, plats préparés, produits sucrés/salés à formulation complexe)

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"niveau": 1}
ou {"niveau": 2}
ou {"niveau": 3}
ou {"niveau": 4}`;

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
      return classerAliment(nom, tentative + 1);
    }
    console.log(`    Échec après 3 tentatives. Dernière réponse reçue : "${nettoye}"`);
    throw e;
  }
}

async function main() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('id, nom')
    .is('niveau_nova', null);

  if (error) {
    console.log('Erreur récupération aliments:', error.message);
    return;
  }

  console.log(`${aliments.length} aliments à classer.`);

  for (const aliment of aliments) {
    try {
      const niveau = await classerAliment(aliment.nom);
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (![1, 2, 3, 4].includes(niveau)) {
        console.log(`  - Aliment ${aliment.id} : niveau inattendu reçu (${niveau}), on passe.`);
        continue;
      }

      const { error: erreurUpdate } = await supabase
        .from('aliments')
        .update({ niveau_nova: niveau })
        .eq('id', aliment.id);

      if (erreurUpdate) {
        console.log(`  - Erreur mise à jour aliment ${aliment.id}:`, erreurUpdate.message);
        continue;
      }

      console.log(`  - ${aliment.nom} : NOVA ${niveau}`);
    } catch (e) {
      console.log(`  - Erreur traitement aliment ${aliment.id}:`, e.message);
    }
  }

  console.log('\nTerminé.');
}

main();
