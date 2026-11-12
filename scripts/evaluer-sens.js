// Sens de l'effet (12 nov. 2026).
//
// Pour chaque liaison étude–problème de santé pas encore évaluée (etudes_problemes.sens_evalue_le vide),
// Claude Haiku lit le titre et le résumé original de l'étude et indique, pour chacun de ses problèmes
// de santé, le sens du résultat : favorable, nul, defavorable, mitige ou sans_objet.
// Une seule requête par étude (tous ses problèmes à la fois). Lancé une fois pour toute la base,
// puis chaque semaine après le classement par problème de santé.
//
// Variables d'environnement :
//   LIMITE           nombre maximal d'études à traiter dans ce run (50 par défaut : échantillon de test)
//   AFFICHER_DETAIL  'true' pour afficher le résultat de chaque étude dans le log

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE = 'claude-haiku-4-5-20251001';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const TAILLE_MAX_LOT_CLAUDE = 5000;
const ATTENTE_MAX_LOT_MIN = 300;
const INTERVALLE_SONDAGE_MS = 30000;
const DELAI_MAX_MS = 60000;
const SENS_AUTORISES = ['favorable', 'nul', 'defavorable', 'mitige', 'sans_objet'];

// Tarif de l'API Batch pour Claude Haiku 4.5, en dollars par million de jetons.
const PRIX_ENTREE_PAR_MILLION = 0.5;
const PRIX_SORTIE_PAR_MILLION = 2.5;

const LIMITE = parseInt(process.env.LIMITE || '50', 10);
const AFFICHER_DETAIL = process.env.AFFICHER_DETAIL === 'true';

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// API Message Batches (même mécanique que les autres scripts)
// ---------------------------------------------------------------------------

function entetesAnthropic() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

async function appelAnthropic(url, options, tentative = 1) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(DELAI_MAX_MS * 2) });
  } catch (e) {
    if (tentative < 5) {
      await pause(5000 * tentative);
      return appelAnthropic(url, options, tentative + 1);
    }
    throw new Error(`API Anthropic injoignable : ${e.message}`);
  }
  if (!res.ok) {
    if ([429, 500, 502, 503, 504, 529].includes(res.status) && tentative < 5) {
      await pause(5000 * tentative);
      return appelAnthropic(url, options, tentative + 1);
    }
    const texte = await res.text().catch(() => '');
    throw new Error(`API Anthropic erreur ${res.status} : ${texte.slice(0, 300)}`);
  }
  return res;
}

async function executerLotClaude(requetes, libelle) {
  const resultats = new Map();
  if (requetes.length === 0) return resultats;

  const idsLots = [];
  for (let i = 0; i < requetes.length; i += TAILLE_MAX_LOT_CLAUDE) {
    const tranche = requetes.slice(i, i + TAILLE_MAX_LOT_CLAUDE);
    const res = await appelAnthropic(URL_BATCHES, {
      method: 'POST',
      headers: entetesAnthropic(),
      body: JSON.stringify({
        requests: tranche.map((r) => ({
          custom_id: r.id,
          params: { model: MODELE, max_tokens: 200, messages: [{ role: 'user', content: r.prompt }] },
        })),
      }),
    });
    const lot = await res.json();
    idsLots.push(lot.id);
    console.log(`  [${libelle}] lot ${lot.id} envoyé (${tranche.length} requêtes).`);
  }

  const debut = Date.now();
  const urlsResultats = new Map();
  while (urlsResultats.size < idsLots.length) {
    if (Date.now() - debut > ATTENTE_MAX_LOT_MIN * 60 * 1000) {
      throw new Error(`[${libelle}] lot non terminé après ${ATTENTE_MAX_LOT_MIN} min (lots : ${idsLots.join(', ')}).`);
    }
    await pause(INTERVALLE_SONDAGE_MS);
    for (const id of idsLots) {
      if (urlsResultats.has(id)) continue;
      const res = await appelAnthropic(`${URL_BATCHES}/${id}`, { method: 'GET', headers: entetesAnthropic() });
      const lot = await res.json();
      if (lot.processing_status === 'ended' && lot.results_url) {
        urlsResultats.set(id, lot.results_url);
        const c = lot.request_counts || {};
        console.log(`  [${libelle}] lot ${id} terminé en ${Math.round((Date.now() - debut) / 60000)} min (réussies : ${c.succeeded}, erreurs : ${c.errored}, expirées : ${c.expired}).`);
      }
    }
  }

  for (const url of urlsResultats.values()) {
    const res = await appelAnthropic(url, { method: 'GET', headers: entetesAnthropic() });
    const texte = await res.text();
    for (const ligne of texte.split('\n')) {
      if (!ligne.trim()) continue;
      let objet;
      try {
        objet = JSON.parse(ligne);
      } catch (e) {
        continue;
      }
      const r = objet.result || {};
      if (r.type === 'succeeded') {
        const contenu = (r.message?.content || []).map((b) => b.text || '').join('');
        resultats.set(objet.custom_id, { ok: true, texte: contenu, usage: r.message?.usage || {} });
      } else {
        resultats.set(objet.custom_id, { ok: false, erreur: r.error?.error?.message || r.type || 'inconnu' });
      }
    }
  }
  return resultats;
}

function extraireJSON(texte) {
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : nettoye);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function promptSens(titre, resume, problemes) {
  const liste = problemes.map((p) => `- ${p.slug} : ${p.nom}`).join('\n');
  return `Tu lis le résumé d'une étude scientifique de nutrition et tu indiques, pour chacun des problèmes de santé ci-dessous, le SENS du résultat de l'étude concernant l'aliment, le régime, le nutriment, le complément ou le contaminant étudié.

Étude :
Titre : ${titre}
Résumé : ${resume}

Problèmes de santé à évaluer :
${liste}

Pour chaque problème, choisis UNE valeur :
- "favorable" : l'étude conclut à un effet bénéfique pour ce problème (amélioration, risque diminué, symptômes réduits).
- "nul" : l'étude ne trouve pas d'effet ni d'association significatifs pour ce problème.
- "defavorable" : l'étude conclut à un effet néfaste (aggravation, risque augmenté, effets indésirables, intoxication, infection).
- "mitige" : résultats partagés (bénéfice sur certains critères mais pas d'autres, effet seulement dans un sous-groupe ou à certaines doses, résultats contradictoires).
- "sans_objet" : l'étude ne conclut pas sur l'effet pour ce problème (revue descriptive ou mécanistique sans conclusion, description d'une maladie sans évaluer l'exposition, prévalence, protocole).

Règles :
- Appuie-toi sur les résultats et les conclusions des auteurs, pas sur tes connaissances générales.
- Le sens concerne la SANTÉ : une association entre une consommation plus élevée et un risque plus faible est "favorable" ; un contaminant qui augmente un risque est "defavorable".
- Un résultat "non significatif" ou une simple « tendance » est "nul".
- Une faible qualité des preuves ne change pas le sens (elle est évaluée ailleurs).

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après, avec une entrée par slug de la liste :
{"sens": {"slug-1": "favorable", "slug-2": "nul"}}`;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

// Charge les liaisons non évaluées et les regroupe par étude, jusqu'à LIMITE études.
// Trois lectures simples (problèmes, liaisons, études), pour éviter les délais dépassés.
async function chargerEtudesAEvaluer(limite) {
  // 1. Les problèmes de santé (138 lignes)
  const { data: problemes, error: erreurProblemes } = await supabase
    .from('problemes_sante')
    .select('id, slug, nom');
  if (erreurProblemes) throw new Error(`Lecture des problèmes impossible : ${erreurProblemes.message}`);
  const problemeParId = new Map(problemes.map((p) => [p.id, p]));

  // 2. Les liaisons à évaluer, sans jointure, jusqu'à LIMITE études
  const liaisonsParEtude = new Map();
  const taillePage = 1000;
  for (let debut = 0; ; debut += taillePage) {
    const { data, error } = await supabase
      .from('etudes_problemes')
      .select('etude_id, probleme_id')
      .is('sens_evalue_le', null)
      .order('etude_id', { ascending: true })
      .order('probleme_id', { ascending: true })
      .range(debut, debut + taillePage - 1);
    if (error) throw new Error(`Lecture des liaisons impossible : ${error.message}`);
    if (!data || data.length === 0) break;
    let plein = false;
    for (const l of data) {
      if (!liaisonsParEtude.has(l.etude_id)) {
        if (liaisonsParEtude.size >= limite) {
          plein = true;
          break;
        }
        liaisonsParEtude.set(l.etude_id, []);
      }
      liaisonsParEtude.get(l.etude_id).push(l.probleme_id);
    }
    if (plein || data.length < taillePage) break;
  }

  // 3. Les études, par paquets de 100
  const ids = [...liaisonsParEtude.keys()];
  const etudes = [];
  for (let i = 0; i < ids.length; i += 100) {
    const paquet = ids.slice(i, i + 100);
    const { data, error } = await supabase
      .from('etudes')
      .select('id, titre_original, titre_traduit, resume_original')
      .in('id', paquet);
    if (error) throw new Error(`Lecture des études impossible : ${error.message}`);
    for (const e of data || []) {
      etudes.push({
        id: e.id,
        titre: e.titre_original || e.titre_traduit || '',
        titreFr: e.titre_traduit || e.titre_original || '',
        resume: e.resume_original || '',
        problemes: liaisonsParEtude.get(e.id).map((pid) => problemeParId.get(pid)).filter(Boolean),
      });
    }
  }
  return etudes;
}

async function main() {
  console.log(`Sens de l'effet : jusqu'à ${LIMITE} étude(s) à évaluer.`);

  const etudes = await chargerEtudesAEvaluer(LIMITE);
  const nbLiaisons = etudes.reduce((s, e) => s + e.problemes.length, 0);
  console.log(`${etudes.length} étude(s), ${nbLiaisons} liaison(s) étude–problème à évaluer.`);
  if (etudes.length === 0) return;

  const requetes = etudes.map((e, i) => ({ id: `se-${i}`, prompt: promptSens(e.titre, e.resume, e.problemes) }));
  const resultats = await executerLotClaude(requetes, 'Sens de l\'effet');

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let nbEvaluees = 0;
  let nbEchecs = 0;
  const compteParSens = new Map();

  for (let i = 0; i < etudes.length; i++) {
    const etude = etudes[i];
    const r = resultats.get(`se-${i}`);
    if (!r || !r.ok) {
      nbEchecs++;
      continue;
    }
    jetonsEntree += r.usage.input_tokens || 0;
    jetonsSortie += r.usage.output_tokens || 0;

    let sensParSlug;
    try {
      sensParSlug = extraireJSON(r.texte).sens || {};
    } catch (e) {
      nbEchecs++;
      continue;
    }

    const lignesDetail = [];
    for (const p of etude.problemes) {
      const sens = SENS_AUTORISES.includes(sensParSlug[p.slug]) ? sensParSlug[p.slug] : null;
      if (!sens) {
        nbEchecs++;
        continue;
      }
      const { error } = await supabase
        .from('etudes_problemes')
        .update({ sens, sens_evalue_le: new Date().toISOString() })
        .eq('etude_id', etude.id)
        .eq('probleme_id', p.id);
      if (error) {
        console.log(`  Enregistrement impossible (${etude.id}, ${p.slug}) : ${error.message}`);
        nbEchecs++;
        continue;
      }
      nbEvaluees++;
      compteParSens.set(sens, (compteParSens.get(sens) || 0) + 1);
      lignesDetail.push(`${p.nom} : ${sens}`);
    }

    if (AFFICHER_DETAIL) {
      console.log(`  - ${etude.titreFr}\n      → ${lignesDetail.join(' · ') || '(échec)'}`);
    }
  }

  const cout = (jetonsEntree * PRIX_ENTREE_PAR_MILLION + jetonsSortie * PRIX_SORTIE_PAR_MILLION) / 1e6;
  const coutParLiaison = nbEvaluees > 0 ? cout / nbEvaluees : 0;

  console.log('\n##### Répartition #####');
  for (const s of SENS_AUTORISES) console.log(`  ${s} : ${compteParSens.get(s) || 0}`);

  console.log('\n##### Bilan #####');
  console.log(`Liaisons évaluées : ${nbEvaluees} | échecs : ${nbEchecs}`);
  console.log(`Jetons : ${jetonsEntree} en entrée, ${jetonsSortie} en sortie`);
  console.log(`Coût réel de ce run : ${cout.toFixed(3)} $ (${(coutParLiaison * 100).toFixed(3)} centime de dollar par liaison)`);
  console.log(`Estimation pour 25 000 liaisons : ${(coutParLiaison * 25000).toFixed(2)} $`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
