// Rédaction des descriptions courtes des fiches et des problèmes de santé (27 oct. 2026).
//
// Pour chaque sujet sans description (aliments, habitudes alimentaires, nutriments, problèmes de santé),
// Claude Sonnet rédige 2 ou 3 phrases FACTUELLES : ce qu'est le sujet, d'où il vient, comment il se
// présente ou à quoi il sert. Jamais d'effet sur la santé, de conseil, de dose ni de promesse : ces
// descriptions ne doivent pas vieillir avec les nouvelles études.
// Les descriptions déjà présentes en base ne sont jamais réécrites.
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
