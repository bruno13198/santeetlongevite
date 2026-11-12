// Sens de l'effet, fiche par fiche (12 nov. 2026).
//
// Le sens général (etudes_problemes.sens) est évalué pour l'étude. Il ne suffit pas quand une étude
// est rattachée à plusieurs fiches (études de substitution ou de comparaison : « remplacer la viande
// rouge par des légumineuses ») ou à un régime défini par un score (une étude sur l'indice
// inflammatoire alimentaire, rattachée à la fiche « Régime anti-inflammatoire »).
// Ce script évalue donc le sens du point de vue de chaque fiche, pour :
//   - les études rattachées à au moins deux fiches ;
//   - toutes les études des régimes et habitudes.
// Une seule requête par étude, avec toutes ses fiches à évaluer, et une température nulle, pour que
// des fiches voisines (mûre, myrtille, cassis…) reçoivent des verdicts cohérents.
// Résultat dans la table sens_par_fiche (fiche – étude – problème). Les couples déjà évalués ne sont
// pas refaits : le script sert aussi chaque semaine, pour les nouvelles études.
//
// Variables d'environnement :
//   LIMITE           nombre maximal d'études à traiter (50 par défaut : test)
//   AFFICHER_DETAIL  'true' pour afficher le résultat de chaque étude dans le log

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE = 'claude-sonnet-5'
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const TAILLE_MAX_LOT_CLAUDE = 5000;
const ATTENTE_MAX_LOT_MIN = 300;
const INTERVALLE_SONDAGE_MS = 30000;
const DELAI_MAX_MS = 60000;
const SENS_AUTORISES = ['favorable', 'nul', 'defavorable', 'mitige', 'sans_objet'];
// Tarif de l'API Batch pour Claude Sonnet, en dollars par million de jetons.
const PRIX_ENTREE_PAR_MILLION = 1.5;
const PRIX_SORTIE_PAR_MILLION = 7.5
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const LIMITE = parseInt(process.env.LIMITE || '50', 10);
const AFFICHER_DETAIL = process.env.AFFICHER_DETAIL === 'true';

const SOURCES = [
  { type: 'aliment', table: 'aliments', liens: 'aliments_etudes', colonne: 'aliment_id', libelle: 'aliment' },
  { type: 'habitude', table: 'habitudes_alimentaires', liens: 'habitudes_etudes', colonne: 'habitude_id', libelle: 'régime ou habitude' },
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
          params: { model: MODELE, max_tokens: 600, temperature: 0, messages: [{ role: 'user', content: r.prompt }] },
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
// Prompt : une étude, toutes ses fiches à évaluer
// ---------------------------------------------------------------------------

function promptSensFiches(titre, resume, fiches, problemes) {
  const listeFiches = fiches.map((f, i) => `${LETTRES[i]}. ${f.nom} (${f.libelle})`).join('\n');
  const listeProblemes = problemes.map((p, i) => `${i + 1}. ${p.nom}`).join('\n');
  const listeVide = `[${problemes.map(() => '"favorable"').join(', ')}]`;
  const exempleComparaison = fiches.map((_, i) => `"${LETTRES[i]}": ${listeVide}`).join(', ');
  return `Tu lis le résumé d'une étude scientifique de nutrition. Cette étude figure sur une ou plusieurs fiches d'un site qui présente, pour chaque fiche, ce que les études disent de ses effets sur la santé.

Étude :
Titre : ${titre}
Résumé : ${resume}

Fiches (lettres) :
${listeFiches}

Problèmes de santé (numéros) :
${listeProblemes}

ÉTAPE 1 — Type d'étude :
- "commune" : l'étude évalue UNE exposition (un aliment, une famille d'aliments, un nutriment, un régime) et les fiches en sont des variantes, des formes ou des membres (par exemple « Ail » et « Ail séché, poudre », ou plusieurs baies dans une revue sur les anthocyanes). C'est le cas le plus fréquent, et le seul possible s'il n'y a qu'une fiche.
- "comparaison" : l'étude compare plusieurs fiches entre elles ou en remplace une par une autre, avec des résultats différents pour chacune (par exemple huile de poisson contre huile de maïs, ou remplacer le pain blanc par un pain à l'amidon résistant).
- Des formes du MÊME aliment (cru ou cuit, entier ou en jus, en poudre, soufflé, nom générique ou nom détaillé, comme « Mil » et « Mil, cuit », « Citron » et « Jus de citron », « Blé de Khorasan » et « Blé khorasan soufflé ») ne sont JAMAIS une comparaison : elles reçoivent le même verdict.

ÉTAPE 2 — Sens du résultat, pour chaque problème, du point de vue de la consommation de l'exposition (ou de l'adhésion au régime) :
- "favorable" : bénéfique pour ce problème (amélioration, risque diminué).
- "nul" : pas d'effet ni d'association significatifs.
- "defavorable" : néfaste (aggravation, risque augmenté, effets indésirables).
- "mitige" : résultats partagés (certains critères seulement, un sous-groupe, résultats contradictoires).
- "sans_objet" : l'étude ne permet pas de conclure sur ce problème.

Règles :
- Le sens porte sur le fait de CONSOMMER ce que désigne la fiche, ou d'y être exposé. Exemples :
  • « réduire les produits de glycation améliore la santé » → "defavorable" pour la fiche Produits de glycation ;
  • « les sucres totaux ne sont pas associés au diabète » → "nul" pour la fiche Sucre ;
  • « une alimentation grasse et sucrée est néfaste, mais les légumes atténuent ce risque » → "favorable" pour la fiche Légumes ;
  • « un probiotique réduit l'exposition aux aflatoxines » → "sans_objet" pour la fiche Mycotoxines (l'étude n'évalue pas l'effet des mycotoxines elles-mêmes) et "favorable" pour la fiche du probiotique.
- Si l'étude mesure l'inverse de ce que désigne une fiche de régime (un indice d'alimentation PRO-inflammatoire pour un « régime anti-inflammatoire », une charge ACIDE pour un « régime alcalin », un index glycémique ÉLEVÉ pour un régime « à index glycémique bas »), inverse le sens pour cette fiche.
- Dans une comparaison : si B fait mieux que A, "favorable" pour B et "defavorable" pour A ; sans différence, "nul" pour les deux ; une fiche qui n'est qu'un simple comparateur sans résultat propre reçoit "sans_objet".
- Appuie-toi sur les résultats et les conclusions des auteurs, pas sur tes connaissances générales. Un résultat non significatif ou une simple tendance est "nul". Une absence d'association avec un risque est "nul", jamais "favorable". Une faible qualité des preuves ne change pas le sens.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après, sous l'une de ces deux formes (${problemes.length} valeur(s) par liste, dans l'ordre des numéros des problèmes) :
- étude commune : {"type": "commune", "sens": ${listeVide}}
- comparaison : {"type": "comparaison", "sens": {${exempleComparaison}}}`;
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

// Renvoie une liste d'études, chacune avec ses fiches à évaluer et ses problèmes de santé.
async function preparerEtudes(limite) {
  const problemes = await lireTout('problemes_sante', 'id, nom', ['id']);
  const nomProbleme = new Map(problemes.map((p) => [p.id, p.nom]));

  const liensProblemes = await lireTout('etudes_problemes', 'etude_id, probleme_id', ['etude_id', 'probleme_id']);
  const problemesParEtude = new Map();
  for (const l of liensProblemes) {
    if (!problemesParEtude.has(l.etude_id)) problemesParEtude.set(l.etude_id, []);
    problemesParEtude.get(l.etude_id).push({ id: l.probleme_id, nom: nomProbleme.get(l.probleme_id) });
  }

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

  const dejaFaits = await lireTout('sens_par_fiche', 'fiche_type, fiche_id, etude_id', ['fiche_type', 'fiche_id', 'etude_id']);
  const cleFaite = new Set(dejaFaits.map((d) => `${d.fiche_type}:${d.fiche_id}:${d.etude_id}`));

  // Couples à évaluer, regroupés par étude
  const parEtude = new Map();
  for (const c of couples) {
    const cle = `${c.source.type}:${c.ficheId}`;
    if (!(nbFichesParEtude.get(c.etudeId) >= 2 || c.source.type === 'habitude')) continue;
    if (!problemesParEtude.has(c.etudeId) || !nomFiche.has(cle)) continue;
    if (cleFaite.has(`${cle}:${c.etudeId}`)) continue;
    if (!parEtude.has(c.etudeId)) parEtude.set(c.etudeId, []);
    parEtude.get(c.etudeId).push({ type: c.source.type, id: c.ficheId, nom: nomFiche.get(cle), libelle: c.source.libelle });
  }
  const nbCouples = [...parEtude.values()].reduce((s, f) => s + f.length, 0);
  console.log(`${parEtude.size} étude(s) et ${nbCouples} couple(s) fiche–étude à évaluer au total.`);

  // Au plus 26 fiches par étude (lettres A à Z) ; les éventuelles suivantes seront traitées au run suivant.
  const ids = [...parEtude.keys()].slice(0, limite);
  const etudes = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('etudes')
      .select('id, titre_original, titre_traduit, resume_original')
      .in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`Lecture des études impossible : ${error.message}`);
    for (const e of data || []) etudes.set(e.id, e);
  }

  return ids
    .filter((id) => etudes.has(id))
    .map((id) => ({
      etude: etudes.get(id),
      fiches: parEtude.get(id).slice(0, LETTRES.length),
      problemes: problemesParEtude.get(id),
    }));
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Sens de l'effet par fiche : jusqu'à ${LIMITE} étude(s).`);
  const etudes = await preparerEtudes(LIMITE);
  console.log(`${etudes.length} étude(s) traitée(s) dans ce run.`);
  if (etudes.length === 0) return;

  const requetes = etudes.map((e, i) => ({
    id: `sf-${i}`,
    prompt: promptSensFiches(
      e.etude.titre_original || e.etude.titre_traduit || '',
      e.etude.resume_original || '',
      e.fiches,
      e.problemes
    ),
  }));
  const resultats = await executerLotClaude(requetes, 'Sens par fiche');

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let nbEvalues = 0;
  let nbEchecs = 0;
  const compteParSens = new Map();
  const lignes = [];

  for (let i = 0; i < etudes.length; i++) {
    const e = etudes[i];
    const r = resultats.get(`sf-${i}`);
    if (!r || !r.ok) {
      nbEchecs++;
      continue;
    }
    jetonsEntree += r.usage.input_tokens || 0;
    jetonsSortie += r.usage.output_tokens || 0;

        let objet;
    try {
      objet = extraireJSON(r.texte);
    } catch (err) {
      nbEchecs++;
      continue;
    }
    // Étude « commune » : une seule liste de verdicts, appliquée à toutes les fiches.
    // Étude « comparaison » : une liste par fiche (lettre).
    const commune = Array.isArray(objet.sens);
    if (!objet.sens || typeof objet.sens !== 'object') {
      nbEchecs++;
      continue;
    }

    const detail = [commune ? '      (verdict commun)' : '      (comparaison)'];
    e.fiches.forEach((f, iFiche) => {
      const verdicts = commune ? objet.sens : objet.sens[LETTRES[iFiche]];
      if (!Array.isArray(verdicts)) {
        nbEchecs++;
        return;
      }
      const morceaux = [];
      e.problemes.forEach((p, iProbleme) => {
        const sens = normaliserSens(verdicts[iProbleme]);
        if (!sens) {
          nbEchecs++;
          return;
        }
        lignes.push({ fiche_type: f.type, fiche_id: f.id, etude_id: e.etude.id, probleme_id: p.id, sens });
        nbEvalues++;
        compteParSens.set(sens, (compteParSens.get(sens) || 0) + 1);
        morceaux.push(`${p.nom} : ${sens}`);
      });
      detail.push(`      [${f.nom}] ${morceaux.join(' · ')}`);
    });

    if (AFFICHER_DETAIL) {
      console.log(`  - ${e.etude.titre_traduit || e.etude.titre_original}\n${detail.join('\n')}`);
    }
  }

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
  console.log(`Coût réel de ce run : ${cout.toFixed(3)} $ (${((cout / etudes.length) * 100).toFixed(3)} centime de dollar par étude)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
