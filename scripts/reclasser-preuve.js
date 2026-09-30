// Reclassement ponctuel des études existantes selon l'échelle d'Oxford (CEBM 2011).
// Traite uniquement les études dont niveau_preuve est vide : peut être relancé
// sans risque, il reprend là où il s'était arrêté.
// Même prompt que classerNiveauPreuve dans import-etudes.js (30 sept. 2026).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LIMITE = parseInt(process.env.LIMITE || '5000', 10);
const MAX_DUREE_MIN = parseInt(process.env.MAX_DUREE_MIN || '330', 10); // arrêt propre avant la limite GitHub de 6 h
const MODELE_ANALYSE = 'claude-sonnet-5';
const DELAI_MAX_MS = 60000;
const TAILLE_PAGE = 200;

const DESIGNS_AUTORISES = [
  "Méta-analyse d'essais randomisés",
  "Revue systématique d'essais randomisés",
  "Revue parapluie d'essais randomisés",
  'Essai randomisé contrôlé',
  'Essai croisé randomisé',
  'Essai non randomisé',
  'Étude pilote sans groupe témoin',
  "Méta-analyse d'études observationnelles",
  "Revue systématique d'études observationnelles",
  "Revue parapluie d'études observationnelles",
  'Étude de cohorte prospective',
  'Étude de cohorte rétrospective',
  'Randomisation mendélienne',
  'Étude cas-témoins',
  'Étude transversale',
  'Série de cas',
  'Cas clinique',
  'Revue narrative',
  'Autre',
];

async function appelerClaude(modele, maxTokens, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modele,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur API Claude ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content.map((b) => b.text || '').join('');
}

function extraireJSON(texte) {
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  return { nettoye, objet: JSON.parse(match ? match[0] : nettoye) };
}

async function classerNiveauPreuve(titre, resumeOriginal, tentative = 1) {
  const prompt = `Tu es un méthodologiste en médecine fondée sur les preuves. Classe l'étude ci-dessous selon l'échelle des niveaux de preuve d'Oxford (CEBM 2011), pour la question « cet aliment ou ce composé alimentaire a-t-il cet effet sur la santé ? ». Base-toi uniquement sur le titre et le résumé.

Titre : ${titre}
Résumé : ${resumeOriginal}

1. Identifie le type d'étude, en choisissant EXACTEMENT un libellé de cette liste :
${DESIGNS_AUTORISES.map((d) => `- ${d}`).join('\n')}
Pour une méta-analyse mêlant essais et études observationnelles, choisis selon le type d'études majoritaire ; si les essais randomisés sont analysés séparément, choisis la version « essais randomisés ».

2. Attribue le niveau de base :
- Niveau 1 : revue systématique, méta-analyse ou revue parapluie d'ESSAIS RANDOMISÉS.
- Niveau 2 : essai randomisé contrôlé (y compris croisé).
- Niveau 3 : essai non randomisé contrôlé, étude de cohorte, randomisation mendélienne, ou revue systématique / méta-analyse / revue parapluie d'études observationnelles.
- Niveau 4 : étude cas-témoins, étude transversale, étude pilote sans groupe témoin, série de cas, cas clinique.
- Niveau 5 : revue narrative ou raisonnement mécanistique (mécanismes, études cellulaires ou animales, hypothèses).

3. Ajuste d'UN niveau au maximum, uniquement si le résumé le justifie clairement :
- Abaisse d'un niveau (chiffre + 1) pour un défaut majeur visible : très petit effectif (moins de 30 participants pour un essai), absence de groupe témoin ou de placebo alors que le type d'étude en supposerait un, résultats très imprécis, ou produit testé éloigné de l'aliment (extrait concentré, mélange de plusieurs ingrédients).
- Relève d'un niveau (chiffre - 1) seulement pour un effet très important et net, rare dans ce domaine.
Le niveau final reste entre 1 et 5. En l'absence d'ajustement, laisse "ajustement" vide.

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après, au format exact :
{"design": "libellé exact de la liste", "niveau": 2, "ajustement": ""}
ou, en cas d'ajustement :
{"design": "Essai randomisé contrôlé", "niveau": 3, "ajustement": "Abaissé : 24 participants, sans placebo"}`;

  let texte = '';
  try {
    texte = await appelerClaude(MODELE_ANALYSE, 400, prompt);
    const { objet } = extraireJSON(texte);
    const niveau = parseInt(objet.niveau, 10);
    if (!(niveau >= 1 && niveau <= 5)) throw new Error('Niveau invalide');
    const design = DESIGNS_AUTORISES.includes(objet.design) ? objet.design : 'Autre';
    const ajustement =
      typeof objet.ajustement === 'string' && objet.ajustement.trim() !== '' ? objet.ajustement.trim() : null;
    return { niveau, design, ajustement };
  } catch (e) {
    if (tentative < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * tentative));
      return classerNiveauPreuve(titre, resumeOriginal, tentative + 1);
    }
    console.log(`  Échec après 3 tentatives (${e.message.slice(0, 100)})`);
    return null;
  }
}

function niveauFiabiliteDepuisPreuve(niveau) {
  if (niveau === 1) return 'haute';
  if (niveau === 2) return 'moderee';
  if (niveau >= 3 && niveau <= 5) return 'preliminaire';
  return null;
}

async function main() {
  const debut = Date.now();
  const compteurs = { traitees: 0, echecs: 0, sansResume: 0, niveaux: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const idsIgnores = new Set(); // études sans résumé ou en échec : on ne les redemande pas dans ce run

  console.log(`Reclassement Oxford : LIMITE=${LIMITE}, MAX_DUREE_MIN=${MAX_DUREE_MIN}`);

  while (compteurs.traitees + compteurs.echecs + compteurs.sansResume < LIMITE) {
    if ((Date.now() - debut) / 60000 > MAX_DUREE_MIN) {
      console.log(`\nDurée maximale atteinte (${MAX_DUREE_MIN} min) : arrêt propre. Relancer le workflow pour continuer.`);
      break;
    }

    const { data: page, error } = await supabase
      .from('etudes')
      .select('id, titre_original, resume_original')
      .is('niveau_preuve', null)
      .order('id', { ascending: true })
      .limit(TAILLE_PAGE + idsIgnores.size);

    if (error) throw new Error(`Erreur lecture études : ${error.message}`);

    const aTraiter = (page || []).filter((e) => !idsIgnores.has(e.id));
    if (aTraiter.length === 0) {
      console.log('\nPlus aucune étude à reclasser.');
      break;
    }

    for (const etude of aTraiter) {
      if (compteurs.traitees + compteurs.echecs + compteurs.sansResume >= LIMITE) break;
      if ((Date.now() - debut) / 60000 > MAX_DUREE_MIN) break;

      if (!etude.resume_original) {
        compteurs.sansResume++;
        idsIgnores.add(etude.id);
        continue;
      }

      const preuve = await classerNiveauPreuve(etude.titre_original, etude.resume_original);
      if (!preuve) {
        compteurs.echecs++;
        idsIgnores.add(etude.id);
        continue;
      }

      const { error: erreurMaj } = await supabase
        .from('etudes')
        .update({
          niveau_preuve: preuve.niveau,
          design_etude: preuve.design,
          ajustement_preuve: preuve.ajustement,
          niveau_fiabilite: niveauFiabiliteDepuisPreuve(preuve.niveau),
        })
        .eq('id', etude.id);

      if (erreurMaj) {
        console.log(`  Erreur mise à jour ${etude.id} : ${erreurMaj.message}`);
        compteurs.echecs++;
        idsIgnores.add(etude.id);
        continue;
      }

      compteurs.traitees++;
      compteurs.niveaux[preuve.niveau]++;
      console.log(`  [${compteurs.traitees}] Niveau ${preuve.niveau} — ${preuve.design}${preuve.ajustement ? ` (${preuve.ajustement})` : ''} : ${etude.titre_original.slice(0, 90)}`);

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const duree = Math.round((Date.now() - debut) / 60000);
  console.log(`\nTerminé en ${duree} min. Reclassées : ${compteurs.traitees}, échecs : ${compteurs.echecs}, sans résumé : ${compteurs.sansResume}.`);
  console.log(`Répartition : niveau 1 = ${compteurs.niveaux[1]}, niveau 2 = ${compteurs.niveaux[2]}, niveau 3 = ${compteurs.niveaux[3]}, niveau 4 = ${compteurs.niveaux[4]}, niveau 5 = ${compteurs.niveaux[5]}.`);
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
