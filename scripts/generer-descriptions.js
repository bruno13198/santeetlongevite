// Rédaction des descriptions courtes des fiches et des problèmes de santé (27 oct. 2026).
//
// Pour chaque sujet sans description (aliments, habitudes alimentaires, nutriments, problèmes de santé),
// Claude Sonnet rédige 2 ou 3 phrases FACTUELLES : ce qu'est le sujet, d'où il vient, comment il se
// présente ou à quoi il sert. Jamais d'effet sur la santé, de conseil, de dose ni de promesse : ces
// descriptions ne doivent pas vieillir avec les nouvelles études.
//
// Variables d'environnement :
//   LIMITE   nombre maximal de sujets traités (20 par défaut : échantillon de test)
//   ECRIRE   'true' pour enregistrer en base ; sinon les descriptions sont seulement affichées dans le log
//
// Le coût réel est calculé à partir des jetons consommés.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE = 'claude-sonnet-5';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const TAILLE_MAX_LOT_CLAUDE = 5000;
const ATTENTE_MAX_LOT_MIN = 300;
const INTERVALLE_SONDAGE_MS = 30000;
const DELAI_MAX_MS = 60000;
const LONGUEUR_MAX = 420; // caractères

// Tarif de l'API Batch pour Claude Sonnet (moitié du tarif normal), en dollars par million de jetons.
const PRIX_ENTREE_PAR_MILLION = 1.5;
const PRIX_SORTIE_PAR_MILLION = 7.5;

const LIMITE = parseInt(process.env.LIMITE || '20', 10);
const ECRIRE = process.env.ECRIRE === 'true';

// Les quatre types de sujets, et ce qu'on donne à Claude pour éviter les confusions.
const SOURCES = [
  { type: 'aliment', table: 'aliments', colonnes: 'id, nom, categorie, termes_recherche', libelle: 'aliment, additif ou contaminant alimentaire' },
  { type: 'habitude', table: 'habitudes_alimentaires', colonnes: 'id, nom, terme_recherche, termes_texte', libelle: 'régime ou habitude alimentaire' },
  { type: 'nutriment', table: 'nutriments', colonnes: 'id, nom, categorie, termes_texte', libelle: 'nutriment, complément alimentaire ou plante' },
  { type: 'probleme', table: 'problemes_sante', colonnes: 'id, nom, famille', libelle: 'problème de santé' },
];

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// API Message Batches (même mécanique que les scripts d'import)
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

// Envoie les requêtes en lot(s) et renvoie une Map id -> { ok, texte, usage } ou { ok: false, erreur }.
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
          params: { model: MODELE, max_tokens: 400, messages: [{ role: 'user', content: r.prompt }] },
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

function promptDescription(source, sujet) {
  const precisions = [
    sujet.categorie ? `Catégorie sur le site : ${sujet.categorie}` : '',
    sujet.famille ? `Famille : ${sujet.famille}` : '',
    Array.isArray(sujet.termes_recherche) && sujet.termes_recherche.length ? `Termes anglais utilisés pour la recherche d'études : ${sujet.termes_recherche.join(', ')}` : '',
    Array.isArray(sujet.termes_texte) && sujet.termes_texte.length ? `Termes anglais utilisés pour la recherche d'études : ${sujet.termes_texte.join(', ')}` : '',
    sujet.terme_recherche ? `Autre terme de recherche : ${sujet.terme_recherche}` : '',
  ].filter(Boolean).join('\n');

  return `Tu rédiges la description courte d'une page d'un site français de veille scientifique en nutrition, destiné aux professionnels de santé et au grand public.

Sujet de la page (${source.libelle}) : ${sujet.nom}
${precisions}

Rédige 2 ou 3 phrases, en français, au total ${LONGUEUR_MAX} caractères au maximum, qui disent uniquement CE QU'EST le sujet :
- pour un aliment : sa nature, son origine, comment il se présente ou se consomme ;
- pour un additif ou un contaminant : ce que c'est, son rôle ou sa provenance, et où on le trouve dans l'alimentation ;
- pour un régime ou une habitude : son principe, ce qu'il privilégie ou limite, son origine si elle est connue ;
- pour un nutriment, un complément ou une plante : ce que c'est, ses sources alimentaires ou sa forme de vente, son nom scientifique s'il s'agit d'une plante ;
- pour un problème de santé : sa définition médicale, de façon simple.

Règles strictes :
- Uniquement des faits établis et stables, qui ne changeront pas avec les nouvelles études.
- AUCUN effet sur la santé, bénéfique ou nocif, AUCUNE allégation (« bon pour », « aide à », « protège », « réduit le risque »), AUCUN conseil, AUCUNE dose recommandée.
- Pour un complément ou une plante, tu peux dire pour quels usages il est vendu ou traditionnellement employé, en le présentant comme un usage revendiqué (« vendu pour… », « traditionnellement utilisé pour… »), jamais comme un effet prouvé.
- Pas de chiffres susceptibles de changer (prévalence, nombre d'études, prix).
- Ton neutre et précis, sans formule d'introduction, sans répéter le nom du sujet en premier mot si ce n'est pas naturel.
- Si le nom du sujet est ambigu, appuie-toi sur les termes anglais fournis.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après : {"description": "..."}`;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function chargerSujetsSansDescription(source, limite) {
  const sujets = [];
  for (let debut = 0; sujets.length < limite; debut += 1000) {
    const { data, error } = await supabase
      .from(source.table)
      .select(`${source.colonnes}, description`)
      .eq('actif', true)
      .order('nom')
      .range(debut, debut + 999);
    if (error) throw new Error(`Lecture de ${source.table} impossible : ${error.message}`);
    if (!data || data.length === 0) break;
    for (const s of data) {
      if (!s.description || s.description.trim() === '') sujets.push(s);
      if (sujets.length >= limite) break;
    }
    if (data.length < 1000) break;
  }
  return sujets;
}

async function main() {
  console.log(`Descriptions : jusqu'à ${LIMITE} sujet(s), ${ECRIRE ? 'ENREGISTREMENT en base' : 'test sans enregistrement'}.`);

  // Répartit la limite entre les types, dans l'ordre (problèmes de santé et régimes d'abord en test)
  const ordre = ECRIRE ? SOURCES : [SOURCES[3], SOURCES[1], SOURCES[2], SOURCES[0]];
  const aTraiter = [];
  const parType = Math.max(1, Math.ceil(LIMITE / ordre.length));
  for (const source of ordre) {
    const reste = LIMITE - aTraiter.length;
    if (reste <= 0) break;
    const sujets = await chargerSujetsSansDescription(source, ECRIRE ? reste : Math.min(parType, reste));
    for (const s of sujets) aTraiter.push({ source, sujet: s });
  }
  console.log(`${aTraiter.length} sujet(s) sans description à rédiger.`);
  if (aTraiter.length === 0) return;

  const requetes = aTraiter.map((x, i) => ({ id: `desc-${i}`, prompt: promptDescription(x.source, x.sujet) }));
  const resultats = await executerLotClaude(requetes, 'Descriptions');

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let nbEcrites = 0;
  let nbEchecs = 0;

  for (let i = 0; i < aTraiter.length; i++) {
    const { source, sujet } = aTraiter[i];
    const r = resultats.get(`desc-${i}`);
    if (!r || !r.ok) {
      nbEchecs++;
      continue;
    }
    jetonsEntree += r.usage.input_tokens || 0;
    jetonsSortie += r.usage.output_tokens || 0;

    let description;
    try {
      description = String(extraireJSON(r.texte).description || '').trim();
    } catch (e) {
      nbEchecs++;
      continue;
    }
    if (!description || description.length > LONGUEUR_MAX + 80) {
      console.log(`  ! ${sujet.nom} : description vide ou trop longue, ignorée.`);
      nbEchecs++;
      continue;
    }

    console.log(`\n[${source.type}] ${sujet.nom}\n  ${description}`);

    if (ECRIRE) {
      const { error } = await supabase.from(source.table).update({ description }).eq('id', sujet.id);
      if (error) {
        console.log(`  ! Enregistrement impossible : ${error.message}`);
        nbEchecs++;
        continue;
      }
      nbEcrites++;
    }
  }

  const cout = (jetonsEntree * PRIX_ENTREE_PAR_MILLION + jetonsSortie * PRIX_SORTIE_PAR_MILLION) / 1e6;
  const coutParSujet = aTraiter.length ? cout / aTraiter.length : 0;
  console.log('\n##### Bilan #####');
  console.log(`Sujets traités : ${aTraiter.length} | enregistrées : ${nbEcrites} | échecs : ${nbEchecs}`);
  console.log(`Coût réel de ce run : ${cout.toFixed(3)} $ (${(coutParSujet * 100).toFixed(3)} centime de dollar par sujet)`);
  console.log(`Estimation pour 820 sujets : ${(coutParSujet * 820).toFixed(2)} $`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
