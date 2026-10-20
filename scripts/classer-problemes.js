// Classement des études par problème de santé (20 oct. 2026).
//
// Pour chaque étude pas encore classée (etudes.problemes_classes_le vide), Claude Haiku lit le titre
// et le résumé simplifié, puis choisit 0 à 4 problèmes de santé dans la liste fixe de la table
// problemes_sante. Les liaisons sont enregistrées dans etudes_problemes, et la date de classement
// est notée sur l'étude, pour qu'un run suivant ne la reclasse pas.
//
// Variables d'environnement :
//   LIMITE           nombre maximal d'études à classer dans ce run (50 par défaut : échantillon de test)
//   AFFICHER_DETAIL  'true' pour afficher dans le log le classement de chaque étude (utile pour le test)
//
// Le coût réel est calculé à partir des jetons consommés, renvoyés par l'API pour chaque requête.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE = 'claude-haiku-4-5-20251001';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const TAILLE_MAX_LOT_CLAUDE = 5000;
const ATTENTE_MAX_LOT_MIN = 300;
const INTERVALLE_SONDAGE_MS = 30000;
const DELAI_MAX_MS = 60000;
const MAX_PROBLEMES_PAR_ETUDE = 4;

// Tarif de l'API Batch pour Claude Haiku 4.5 (moitié du tarif normal), en dollars par million de jetons.
const PRIX_ENTREE_PAR_MILLION = 0.5;
const PRIX_SORTIE_PAR_MILLION = 2.5;

const LIMITE = parseInt(process.env.LIMITE || '50', 10);
const AFFICHER_DETAIL = process.env.AFFICHER_DETAIL === 'true';

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
          params: { model: MODELE, max_tokens: 150, messages: [{ role: 'user', content: r.prompt }] },
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

function promptClassement(listeProblemes, titre, resume) {
  return `Tu classes une étude scientifique de nutrition selon les problèmes de santé qu'elle concerne, pour un site destiné aux professionnels de la nutrition.

Liste fermée des problèmes de santé (slug : intitulé) :
${listeProblemes}

Étude :
Titre : ${titre}
Résumé : ${resume}

Règles :
- Choisis les problèmes de santé sur lesquels l'étude apporte une information : son critère de santé mesuré (par exemple la glycémie pour le diabète, la tension pour l'hypertension), ou la population malade étudiée (par exemple des patients atteints de maladie rénale).
- Ne choisis pas un problème seulement cité en passant ou évoqué comme perspective.
- 0 à ${MAX_PROBLEMES_PAR_ETUDE} problèmes au maximum, du plus central au moins central.
- Utilise UNIQUEMENT des slugs de la liste, recopiés exactement.
- Si aucun problème de la liste ne correspond (étude sur la composition d'un aliment, les apports, les habitudes ou les connaissances, sans critère de santé), renvoie une liste vide.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après, au format :
{"problemes": ["slug-1", "slug-2"]}`;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function chargerEtudesNonClassees(limite) {
  const etudes = [];
  const taillePage = 1000;
  for (let debut = 0; etudes.length < limite; debut += taillePage) {
    const fin = Math.min(debut + taillePage, debut + (limite - etudes.length)) - 1;
    const { data, error } = await supabase
      .from('etudes')
      .select('id, titre_traduit, titre_original, resume_simplifie, resume_reformule')
      .is('problemes_classes_le', null)
      .order('created_at', { ascending: false })
      .range(debut, fin);
    if (error) throw new Error(`Lecture des études impossible : ${error.message}`);
    if (!data || data.length === 0) break;
    etudes.push(...data);
    if (data.length < fin - debut + 1) break;
  }
  return etudes;
}

async function main() {
  console.log(`Classement par problème de santé : jusqu'à ${LIMITE} étude(s) non classée(s).`);

  const { data: problemes, error: erreurProblemes } = await supabase
    .from('problemes_sante')
    .select('id, slug, nom')
    .eq('actif', true)
    .order('ordre', { ascending: true });
  if (erreurProblemes || !problemes || problemes.length === 0) {
    throw new Error(`Liste des problèmes de santé introuvable : ${erreurProblemes?.message || 'table vide'}`);
  }
  const idParSlug = new Map(problemes.map((p) => [p.slug, p.id]));
  const nomParSlug = new Map(problemes.map((p) => [p.slug, p.nom]));
  const listeProblemes = problemes.map((p) => `${p.slug} : ${p.nom}`).join('\n');

  const etudes = await chargerEtudesNonClassees(LIMITE);
  console.log(`${etudes.length} étude(s) à classer.`);
  if (etudes.length === 0) return;

  const requetes = etudes.map((e, i) => ({
    id: `cl-${i}`,
    prompt: promptClassement(
      listeProblemes,
      e.titre_traduit || e.titre_original || '',
      e.resume_simplifie || e.resume_reformule || ''
    ),
  }));

  const resultats = await executerLotClaude(requetes, 'Classement santé');

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  let nbLiaisons = 0;
  let nbClassees = 0;
  let nbSansProbleme = 0;
  let nbEchecs = 0;
  const compteParProbleme = new Map();

  for (let i = 0; i < etudes.length; i++) {
    const etude = etudes[i];
    const r = resultats.get(`cl-${i}`);
    if (!r || !r.ok) {
      nbEchecs++;
      continue;
    }
    jetonsEntree += r.usage.input_tokens || 0;
    jetonsSortie += r.usage.output_tokens || 0;

    let slugs;
    try {
      const objet = extraireJSON(r.texte);
      slugs = Array.isArray(objet.problemes) ? objet.problemes : [];
    } catch (e) {
      nbEchecs++;
      continue;
    }
    // Garde uniquement les slugs valides, sans doublon, dans la limite autorisée.
    slugs = [...new Set(slugs.filter((s) => idParSlug.has(s)))].slice(0, MAX_PROBLEMES_PAR_ETUDE);

    if (slugs.length > 0) {
      const lignes = slugs.map((s) => ({ etude_id: etude.id, probleme_id: idParSlug.get(s) }));
      const { error } = await supabase.from('etudes_problemes').upsert(lignes, { onConflict: 'etude_id,probleme_id', ignoreDuplicates: true });
      if (error) {
        console.log(`  Enregistrement impossible pour l'étude ${etude.id} : ${error.message}`);
        nbEchecs++;
        continue;
      }
      nbLiaisons += lignes.length;
      for (const s of slugs) compteParProbleme.set(s, (compteParProbleme.get(s) || 0) + 1);
    } else {
      nbSansProbleme++;
    }

    await supabase.from('etudes').update({ problemes_classes_le: new Date().toISOString() }).eq('id', etude.id);
    nbClassees++;

    if (AFFICHER_DETAIL) {
      const noms = slugs.length > 0 ? slugs.map((s) => nomParSlug.get(s)).join(' · ') : '(aucun)';
      console.log(`  - ${etude.titre_traduit || etude.titre_original}\n      → ${noms}`);
    }
  }

  const cout = (jetonsEntree * PRIX_ENTREE_PAR_MILLION + jetonsSortie * PRIX_SORTIE_PAR_MILLION) / 1e6;
  const coutParEtude = nbClassees > 0 ? cout / nbClassees : 0;

  console.log('\n##### Répartition par problème de santé #####');
  [...compteParProbleme.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log(`  ${nomParSlug.get(s)} : ${n}`));

  console.log('\n##### Bilan #####');
  console.log(`Études classées : ${nbClassees} | sans problème de santé : ${nbSansProbleme} | liaisons créées : ${nbLiaisons} | échecs : ${nbEchecs}`);
  console.log(`Jetons : ${jetonsEntree} en entrée, ${jetonsSortie} en sortie`);
  console.log(`Coût réel de ce run : ${cout.toFixed(3)} $ (${(coutParEtude * 100).toFixed(3)} centime de dollar par étude)`);
  console.log(`Estimation pour 7 434 études : ${(coutParEtude * 7434).toFixed(2)} $`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
