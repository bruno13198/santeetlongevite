// Vérification des descriptions courtes (27 oct. 2026).
//
// Relit toutes les descriptions existantes (aliments, habitudes, nutriments, problèmes de santé) et signale
// celles qui contiennent une erreur de fait, une incohérence, une allégation santé ou une faute de langue,
// avec une correction proposée. N'écrit RIEN en base : le log se termine par un bloc SQL à relire,
// puis à coller dans le SQL Editor de Supabase (supprimer les lignes refusées avant d'exécuter).
//
// Variable d'environnement :
//   LIMITE   nombre maximal de descriptions vérifiées (toutes par défaut)

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

const LIMITE = parseInt(process.env.LIMITE || '100000', 10);

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
          params: { model: MODELE, max_tokens: 800, messages: [{ role: 'user', content: r.prompt }] },
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

// Retire les éventuelles balises de code Markdown (trois accents graves, écrits \x60 ici) autour du JSON.
function extraireJSON(texte) {
  const nettoye = texte.replace(/\x60{3}(json)?/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : nettoye);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function promptVerification(source, sujet) {
  const precisions = [
    sujet.categorie ? `Catégorie sur le site : ${sujet.categorie}` : '',
    sujet.famille ? `Famille : ${sujet.famille}` : '',
    Array.isArray(sujet.termes_recherche) && sujet.termes_recherche.length ? `Termes anglais de recherche d'études : ${sujet.termes_recherche.join(', ')}` : '',
    Array.isArray(sujet.termes_texte) && sujet.termes_texte.length ? `Termes anglais de recherche d'études : ${sujet.termes_texte.join(', ')}` : '',
    sujet.terme_recherche ? `Autre terme de recherche : ${sujet.terme_recherche}` : '',
  ].filter(Boolean).join('\n');

  return `Tu es relecteur scientifique pour un site français de veille scientifique en nutrition, lu par des professionnels de santé et le grand public. Tu vérifies la description courte d'une page.

Sujet de la page (${source.libelle}) : ${sujet.nom}
${precisions}

Description à vérifier :
« ${sujet.description} »

Vérifie point par point :
1. Exactitude : chaque affirmation est-elle correcte selon les connaissances établies (nom scientifique, famille botanique ou zoologique, origine, composition, procédé de fabrication, codes d'additifs, réglementation, transformations dans l'organisme) ?
2. Cohérence : la description porte-t-elle bien sur ce sujet, sans contradiction interne, phrase absurde, comparaison circulaire ni mot inventé ?
3. Neutralité : aucune allégation d'effet sur la santé, aucun conseil, aucune dose. Les usages présentés comme revendiqués ou traditionnels (« vendu pour… », « traditionnellement utilisé pour… ») sont acceptés.
4. Langue : fautes d'orthographe, d'accord ou de genre, mots répétés.

Ne signale PAS : les choix de style, les simplifications acceptables pour le grand public, les informations absentes.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après :
- si tout est correct : {"statut": "ok"}
- sinon : {"statut": "a_revoir", "problemes": ["problème 1 en une phrase", "..."], "correction": "description complète corrigée"}

La correction reprend la description en changeant le moins possible : 2 ou 3 phrases, ${LONGUEUR_MAX} caractères au maximum, uniquement des faits établis, sans allégation, sans conseil, sans terme anglais, sans répéter le nom du sujet en premier mot.`;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function chargerDescriptions(source) {
  const sujets = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from(source.table)
      .select(`${source.colonnes}, description`)
      .eq('actif', true)
      .order('nom')
      .range(debut, debut + 999);
    if (error) throw new Error(`Lecture de ${source.table} impossible : ${error.message}`);
    if (!data || data.length === 0) break;
    for (const s of data) {
      if (s.description && s.description.trim() !== '') sujets.push(s);
    }
    if (data.length < 1000) break;
  }
  return sujets;
}

function sqlTexte(texte) {
  return `'${String(texte).replace(/'/g, "''")}'`;
}

async function main() {
  const aTraiter = [];
  for (const source of SOURCES) {
    const sujets = await chargerDescriptions(source);
    for (const s of sujets) {
      if (aTraiter.length >= LIMITE) break;
      aTraiter.push({ source, sujet: s });
    }
  }
  console.log(`Vérification : ${aTraiter.length} description(s), aucune écriture en base.`);
  if (aTraiter.length === 0) return;

  const requetes = aTraiter.map((x, i) => ({ id: `verif-${i}`, prompt: promptVerification(x.source, x.sujet) }));
  const resultats = await executerLotClaude(requetes, 'Vérification');

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let nbOk = 0;
  const aRevoir = [];
  const echecs = [];

  for (let i = 0; i < aTraiter.length; i++) {
    const { source, sujet } = aTraiter[i];
    const r = resultats.get(`verif-${i}`);
    if (!r || !r.ok) {
      echecs.push(sujet.nom);
      continue;
    }
    jetonsEntree += r.usage.input_tokens || 0;
    jetonsSortie += r.usage.output_tokens || 0;

    let verdict;
    try {
      verdict = extraireJSON(r.texte);
    } catch (e) {
      echecs.push(sujet.nom);
      continue;
    }
    if (verdict.statut !== 'a_revoir') {
      nbOk++;
      continue;
    }
    const correction = String(verdict.correction || '').trim();
    aRevoir.push({ source, sujet, problemes: Array.isArray(verdict.problemes) ? verdict.problemes : [], correction });
  }

  for (const x of aRevoir) {
    console.log(`\n[${x.source.type}] ${x.sujet.nom}`);
    for (const p of x.problemes) console.log(`  - ${p}`);
    console.log(`  Actuelle : ${x.sujet.description}`);
    console.log(`  Proposée : ${x.correction || '(aucune correction proposée)'}`);
  }

  const corrigeables = aRevoir.filter((x) => x.correction && x.correction.length <= LONGUEUR_MAX + 80);
  if (corrigeables.length) {
    console.log('\n##### SQL à relire, puis à coller dans le SQL Editor (supprime les lignes refusées) #####');
    for (const x of corrigeables) {
      console.log(`-- ${x.source.type} : ${x.sujet.nom}`);
      console.log(`update ${x.source.table} set description = ${sqlTexte(x.correction)} where id = ${sqlTexte(x.sujet.id)};`);
    }
  }

  const cout = (jetonsEntree * PRIX_ENTREE_PAR_MILLION + jetonsSortie * PRIX_SORTIE_PAR_MILLION) / 1e6;
  console.log('\n##### Bilan #####');
  console.log(`Vérifiées : ${aTraiter.length} | correctes : ${nbOk} | à revoir : ${aRevoir.length} | échecs : ${echecs.length}`);
  if (echecs.length) console.log(`Échecs : ${echecs.join(', ')}`);
  console.log(`Coût réel de ce run : ${cout.toFixed(3)} $`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
