// Génère une LISTE de termes de recherche anglais (2 à 4 variantes) par aliment,
// stockée dans aliments.termes_recherche (text[]).
// Remplace à terme terme_recherche (chaîne unique), dont le découpage en mots
// reliés par AND dans la requête Europe PMC rendait beaucoup d'aliments
// invisibles (ex: "red bell pepper" ne trouve pas "Capsicum annuum").
//
// Variable d'environnement :
//   SLUGS_CIBLES : slugs séparés par des virgules (obligatoire pour l'instant,
//                  le temps de valider l'approche sur un échantillon)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function genererTermes(nom, tentative = 1) {
  const prompt = `Tu es un expert en nutrition et en recherche scientifique. Pour l'ALIMENT français suivant, donne la liste des termes de recherche en ANGLAIS à utiliser pour interroger la base de données scientifique Europe PMC (titres et résumés d'études).

Nom de l'aliment : ${nom}

Ces termes seront combinés par OR : une étude sera trouvée si elle contient l'un OU l'autre. Chaque terme sera cherché comme une expression exacte.

Règles :
- Donne entre 1 et 4 termes, classés du plus utilisé au moins utilisé dans la littérature scientifique
- Inclus le nom commun anglais dominant, ses synonymes courants, et le nom scientifique latin s'il est réellement employé dans les publications de nutrition
- Chaque terme fait 1 à 3 mots maximum, sans ponctuation ni guillemets
- N'invente pas de variantes artificielles : si un aliment n'a qu'un seul nom usuel, donne un seul terme
- Évite les termes trop génériques qui ramèneraient un large bruit (ex: "fish" seul, "cheese" seul, "oil" seul)
- Ne donne pas de termes désignant un aliment différent, même proche

Exemples de bonnes réponses :
- Poivron rouge, cru → {"termes": ["red bell pepper", "sweet pepper", "Capsicum annuum"]}
- Aubergine, crue → {"termes": ["eggplant", "aubergine", "Solanum melongena"]}
- Sprat, cru → {"termes": ["sprat", "Sprattus sprattus"]}

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"termes": ["terme 1", "terme 2"]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
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
    if (!Array.isArray(resultat.termes) || resultat.termes.length === 0) {
      throw new Error('Champ termes manquant ou vide');
    }
    return resultat.termes.map((t) => String(t).trim()).filter(Boolean).slice(0, 4);
  } catch (e) {
    if (tentative < 3) {
      console.log(`    Réponse incomplète ("${nettoye}"), nouvelle tentative (${tentative + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return genererTermes(nom, tentative + 1);
    }
    console.log(`    Échec après 3 tentatives. Dernière réponse reçue : "${nettoye}"`);
    throw e;
  }
}

async function main() {
  const slugsCibles = process.env.SLUGS_CIBLES;
  const NB_LOTS = parseInt(process.env.NB_LOTS || '10', 10);
  const LOT_ACTUEL = parseInt(process.env.LOT_ACTUEL || '0', 10);
  const FORCER = process.env.FORCER === 'true';

  let requete = supabase
    .from('aliments')
    .select('id, nom, slug, terme_recherche, termes_recherche')
    .eq('actif', true)
    .order('id', { ascending: true });

  if (slugsCibles) {
    const listeSlugs = slugsCibles.split(',').map((s) => s.trim()).filter(Boolean);
    requete = requete.in('slug', listeSlugs);
  }

  const { data: aliments, error } = await requete;

  if (error) {
    console.log('Erreur récupération aliments:', error.message);
    return;
  }

  // Sans FORCER, on saute les aliments qui ont déjà des termes multiples :
  // permet de relancer sans regénérer (ni repayer) ce qui est déjà fait.
  const aTraiter = FORCER
    ? aliments
    : aliments.filter((a) => !Array.isArray(a.termes_recherche) || a.termes_recherche.length === 0);

  const lot = slugsCibles
    ? aTraiter
    : aTraiter.filter((_, index) => index % NB_LOTS === LOT_ACTUEL);

  console.log(
    `${aliments.length} aliment(s) actif(s) récupéré(s), ${aTraiter.length} sans termes multiples.` +
    (slugsCibles ? '' : ` Lot ${LOT_ACTUEL}/${NB_LOTS - 1} : ${lot.length} à traiter.`)
  );

  for (const aliment of lot) {
    try {
      const termes = await genererTermes(aliment.nom);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { error: erreurUpdate } = await supabase
        .from('aliments')
        .update({ termes_recherche: termes })
        .eq('id', aliment.id);

      if (erreurUpdate) {
        console.log(`  - Erreur mise à jour ${aliment.slug}:`, erreurUpdate.message);
        continue;
      }

      console.log(`  - ${aliment.slug} : ${JSON.stringify(termes)}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${aliment.slug}:`, e.message);
    }
  }

  console.log('\nTerminé.');
}

main();
