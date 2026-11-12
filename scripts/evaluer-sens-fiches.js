// Sens de l'effet, fiche par fiche (12 nov. 2026).
//
// Le sens général (etudes_problemes.sens) est évalué pour l'étude. Il ne suffit pas quand une étude
// est rattachée à plusieurs fiches (études de substitution ou de comparaison : « remplacer la viande
// rouge par des légumineuses ») ou à un régime défini par un score (une étude sur l'indice
// inflammatoire alimentaire, rattachée à la fiche « Régime anti-inflammatoire »).
// Ce script évalue donc le sens du point de vue de chaque fiche, pour :
//   - les études rattachées à au moins deux fiches ;
//   - toutes les études des régimes et habitudes.
// Résultat dans la table sens_par_fiche (fiche – étude – problème). Les trios déjà évalués ne sont
// pas refaits : le script sert aussi chaque semaine, pour les nouvelles études.
//
// Variables d'environnement :
//   LIMITE           nombre maximal de couples fiche–étude à évaluer (50 par défaut : test)
//   AFFICHER_DETAIL  'true' pour afficher le résultat de chaque couple dans le log

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE = 'claude-haiku-4-5-20251001';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const TAILLE_MAX_LOT_CLAUDE = 5000;
const ATTENTE_MAX_LOT_MIN = 300;
const INTERVALLE_SONDAGE_MS = 30000;
const DELAI_MAX_MS = 60000;
const SENS_AUTORISES = ['favorable', 'nul', 'defavorable', 'mitige', 'sans_objet'];
const PRIX_ENTREE_PAR_MILLION = 0.5;
const PRIX_SORTIE_PAR_MILLION = 2.5;

const LIMITE = parseInt(process.env.LIMITE || '50', 10);
const AFFICHER_DETAIL = process.env.AFFICHER_DETAIL === 'true';

const SOURCES = [
  { type: 'aliment', table: 'aliments', liens: 'aliments_etudes', colonne: 'aliment_id', libelle: 'aliment' },
  { type: 'habitude', table: 'habitudes_alimentaires', liens: 'habitudes_etudes', colonne: 'habitude_id', libelle: 'régime ou habitude alimentaire' },
  { type: 'nutriment', table: 'nutriments', liens: 'nutriments_etudes', colonne: 'nutriment_id', libelle: 'nutriment, complément ou plante' },
];

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

function normaliserSens(valeur) {
  if (typeof valeur !== 'string') return null;
  const v = valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_');
  return SENS_AUTORISES.includes(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function promptSensFiche(nomFiche, libelleType, titre, resume, problemes) {
  const liste = problemes.map((p, i) => `${i + 1}. ${p.nom}`).join('\n');
  return `Tu lis le résumé d'une étude scientifique de nutrition. Cette étude figure sur la fiche « ${nomFiche} » (${libelleType}) d'un site qui présente, pour chaque fiche, ce que les études disent de ses effets sur la santé.

Indique, pour chacun des problèmes de santé ci-dessous, le SENS du résultat DU POINT DE VUE DE CETTE FICHE : l'étude montre-t-elle que consommer « ${nomFiche} » (ou suivre ce régime, ou en consommer davantage) est bénéfique, sans effet ou néfaste pour ce problème ?

Étude :
Titre : ${titre}
Résumé : ${resume}

Problèmes de santé à évaluer (numérotés) :
${liste}

Pour chaque problème, choisis UNE valeur :
- "favorable" : bénéfique pour ce problème (amélioration, risque diminué).
- "nul" : pas d'effet ni d'association significatifs.
- "defavorable" : néfaste (aggravation, risque augmenté, effets indésirables).
- "mitige" : résultats partagés (certains critères seulement, un sous-groupe, résultats contradictoires).
- "sans_objet" : l'étude ne permet pas de conclure pour « ${nomFiche} » sur ce problème.

Règles :
- Traduis toujours la conclusion pour « ${nomFiche} ». Si l'étude mesure l'inverse de la fiche (par exemple un indice d'alimentation PRO-inflammatoire pour une fiche « régime anti-inflammatoire », une charge ACIDE pour un « régime alcalin », un index glycémique ÉLEVÉ pour un régime « à index glycémique bas »), inverse le sens : une alimentation pro-inflammatoire associée à plus de maladies est "favorable" pour la fiche « régime anti-inflammatoire ».
- Pour une étude de substitution ou de comparaison (remplacer A par B, comparer A et B) : si B fait mieux que A, c'est "favorable" pour la fiche B et "defavorable" pour la fiche A ; s'il n'y a pas de différence, "nul" pour les deux.
- Si « ${nomFiche} » n'est qu'un ingrédient parmi d'autres, un simple comparateur ou un élément secondaire de l'étude, sans conclusion propre, réponds "sans_objet".
- Appuie-toi sur les résultats et les conclusions des auteurs, pas sur tes connaissances générales. Un résultat non significatif ou une simple tendance est "nul".
- Une faible qualité des preuves ne change pas le sens.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après, contenant une liste de ${problemes.length} valeur(s), dans l'ordre des numéros :
{"sens": ["favorable"${problemes.length > 1 ? ', "nul"' : ''}]}`;
}

// ---------------------------------------------------------------------------
// Lecture des données
// ---------------------------------------------------------------------------

async function lireTout(table, colonnes, ordre) {
  const lignes = [];
  for (let debut = 0; ; debut += 1000) {
    let requete = supabase.from(table).select(colonnes);
    for (const c of ordre) requete = requete.order(c, { ascending: true });
    const { data, error } = await requete.range(debut, debut + 999);
    if (error) throw new Error(`Lecture de ${table} impossible : ${error.message}`);
    lignes.push(...data);
    if (data.length < 1000) break;
  }
  return lignes;
}

async function preparerCouples(limite) {
  // Problèmes de santé
  const problemes = await lireTout('problemes_sante', 'id, nom', ['id']);
  const nomProbleme = new Map(problemes.map((p) => [p.id, p.nom]));

  // Problèmes de chaque étude
  const liensProblemes = await lireTout('etudes_problemes', 'etude_id, probleme_id', ['etude_id', 'probleme_id']);
  const problemesParEtude = new Map();
  for (const l of liensProblemes) {
    if (!problemesParEtude.has(l.etude_id)) problemesParEtude.set(l.etude_id, []);
    problemesParEtude.get(l.etude_id).push({ id: l.probleme_id, nom: nomProbleme.get(l.probleme_id) });
  }

  // Fiches de chaque étude, et noms des fiches
  const couples = [];
  const nbFichesParEtude = new Map();
  const nomFiche = new Map();
  for (const s of SOURCES) {
    const fiches = await lireTout(s.table, 'id, nom', ['id']);
    for (const f of fiches) nomFiche.set(`${s.type}:${f.id}`, f.nom);
    const liens = await lireTout(s.liens, `${s.colonne}, etude_id`, ['etude_id', s.colonne]);
    for (const l of liens) {
      couples.push({ source: s, ficheId: l[s.colonne], etudeId: l.etude_id });
      nbFichesParEtude.set(l.etude_id, (nbFichesParEtude.get(l.etude_id) || 0) + 1);
    }
  }

  // Couples déjà évalués
  const dejaFaits = await lireTout('sens_par_fiche', 'fiche_type, fiche_id, etude_id', ['fiche_type', 'fiche_id', 'etude_id']);
  const cleFaite = new Set(dejaFaits.map((d) => `${d.fiche_type}:${d.fiche_id}:${d.etude_id}`));

  // Sélection : études à plusieurs fiches, ou fiches de régimes et habitudes ; avec au moins un problème
  const aFaire = couples.filter(
    (c) =>
      (nbFichesParEtude.get(c.etudeId) >= 2 || c.source.type === 'habitude') &&
      problemesParEtude.has(c.etudeId) &&
      nomFiche.has(`${c.source.type}:${c.ficheId}`) &&
      !cleFaite.has(`${c.source.type}:${c.ficheId}:${c.etudeId}`)
  );
  console.log(`${aFaire.length} couple(s) fiche–étude à évaluer au total.`);
  const selection = aFaire.slice(0, limite);

  // Titres et résumés des études concernées, par paquets de 100
  const idsEtudes = [...new Set(selection.map((c) => c.etudeId))];
  const etudes = new Map();
  for (let i = 0; i < idsEtudes.length; i += 100) {
    const { data, error } = await supabase
      .from('etudes')
      .select('id, titre_original, titre_traduit, resume_original')
      .in('id', idsEtudes.slice(i, i + 100));
    if (error) throw new Error(`Lecture des études impossible : ${error.message}`);
    for (const e of data || []) etudes.set(e.id, e);
  }

  return selection
    .filter((c) => etudes.has(c.etudeId))
    .map((c) => ({
      ...c,
      nomFiche: nomFiche.get(`${c.source.type}:${c.ficheId}`),
      etude: etudes.get(c.etudeId),
      problemes: problemesParEtude.get(c.etudeId),
    }));
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Sens de l'effet par fiche : jusqu'à ${LIMITE} couple(s) fiche–étude.`);
  const couples = await preparerCouples(LIMITE);
  console.log(`${couples.length} couple(s) traité(s) dans ce run.`);
  if (couples.length === 0) return;

  const requetes = couples.map((c, i) => ({
    id: `sf-${i}`,
    prompt: promptSensFiche(
      c.nomFiche,
      c.source.libelle,
      c.etude.titre_original || c.etude.titre_traduit || '',
      c.etude.resume_original || '',
      c.problemes
    ),
  }));
  const resultats = await executerLotClaude(requetes, 'Sens par fiche');

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let nbEvalues = 0;
  let nbEchecs = 0;
  const compteParSens = new Map();
  const lignes = [];

  for (let i = 0; i < couples.length; i++) {
    const c = couples[i];
    const r = resultats.get(`sf-${i}`);
    if (!r || !r.ok) {
      nbEchecs++;
      continue;
    }
    jetonsEntree += r.usage.input_tokens || 0;
    jetonsSortie += r.usage.output_tokens || 0;

    let reponse;
    try {
      reponse = extraireJSON(r.texte).sens;
    } catch (e) {
      nbEchecs++;
      continue;
    }
    if (!Array.isArray(reponse)) {
      nbEchecs++;
      continue;
    }

    const detail = [];
    c.problemes.forEach((p, index) => {
      const sens = normaliserSens(reponse[index]);
      if (!sens) {
        nbEchecs++;
        return;
      }
      lignes.push({ fiche_type: c.source.type, fiche_id: c.ficheId, etude_id: c.etudeId, probleme_id: p.id, sens });
      nbEvalues++;
      compteParSens.set(sens, (compteParSens.get(sens) || 0) + 1);
      detail.push(`${p.nom} : ${sens}`);
    });

    if (AFFICHER_DETAIL) {
      console.log(`  - [${c.nomFiche}] ${c.etude.titre_traduit || c.etude.titre_original}\n      → ${detail.join(' · ') || '(échec)'}`);
    }
  }

  // Enregistrement par paquets de 500
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await supabase
      .from('sens_par_fiche')
      .upsert(lignes.slice(i, i + 500), { onConflict: 'fiche_type,fiche_id,etude_id,probleme_id' });
    if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  }

  const cout = (jetonsEntree * PRIX_ENTREE_PAR_MILLION + jetonsSortie * PRIX_SORTIE_PAR_MILLION) / 1e6;
  console.log('\n##### Répartition #####');
  for (const s of SENS_AUTORISES) console.log(`  ${s} : ${compteParSens.get(s) || 0}`);
  console.log('\n##### Bilan #####');
  console.log(`Trios fiche–étude–problème enregistrés : ${nbEvalues} | échecs : ${nbEchecs}`);
  console.log(`Jetons : ${jetonsEntree} en entrée, ${jetonsSortie} en sortie`);
  console.log(`Coût réel de ce run : ${cout.toFixed(3)} $ (${couples.length > 0 ? ((cout / couples.length) * 100).toFixed(3) : 0} centime de dollar par couple fiche–étude)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
