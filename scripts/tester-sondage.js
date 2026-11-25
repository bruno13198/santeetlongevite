// Test des prompts améliorés sur les 50 cas du sondage (25 nov. 2026).
//
// Lit la table test_sondage (50 trios fiche–étude–problème tirés au hasard), puis relance sur ces
// études seulement :
//   1. le sens de l'effet « par fiche », avec deux règles ajoutées (manque d'apport, critère principal) ;
//   2. le classement par problème de santé, avec la règle sur la maladie des participants corrigée.
// Les anciens et les nouveaux résultats sont AFFICHÉS dans le journal. RIEN n'est enregistré en base.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELE = 'claude-haiku-4-5-20251001';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const ATTENTE_MAX_LOT_MIN = 120;
const INTERVALLE_SONDAGE_MS = 30000;
const DELAI_MAX_MS = 60000;
const SENS_AUTORISES = ['favorable', 'nul', 'defavorable', 'mitige', 'sans_objet'];
const PRIX_ENTREE_PAR_MILLION = 0.5;
const PRIX_SORTIE_PAR_MILLION = 2.5;
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_PROBLEMES_PAR_ETUDE = 3;

const SOURCES = [
  { type: 'aliment', table: 'aliments', liens: 'aliments_etudes', colonne: 'aliment_id', libelle: 'aliment' },
  { type: 'habitude', table: 'habitudes_alimentaires', liens: 'habitudes_etudes', colonne: 'habitude_id', libelle: 'régime ou habitude' },
  { type: 'nutriment', table: 'nutriments', liens: 'nutriments_etudes', colonne: 'nutriment_id', libelle: 'nutriment, complément ou plante' },
];

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// API Message Batches (même mécanique que les scripts de production)
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

// requetes : [{ id, prompt, maxTokens }] ; renvoie une Map id -> { ok, texte, usage }
async function executerLotClaude(requetes, libelle) {
  const resultats = new Map();
  if (requetes.length === 0) return resultats;

  const res = await appelAnthropic(URL_BATCHES, {
    method: 'POST',
    headers: entetesAnthropic(),
    body: JSON.stringify({
      requests: requetes.map((r) => ({
        custom_id: r.id,
        params: { model: MODELE, max_tokens: r.maxTokens, temperature: 0, messages: [{ role: 'user', content: r.prompt }] },
      })),
    }),
  });
  const lot = await res.json();
  console.log(`  [${libelle}] lot ${lot.id} envoyé (${requetes.length} requêtes).`);

  const debut = Date.now();
  let urlResultats = null;
  while (!urlResultats) {
    if (Date.now() - debut > ATTENTE_MAX_LOT_MIN * 60 * 1000) {
      throw new Error(`[${libelle}] lot non terminé après ${ATTENTE_MAX_LOT_MIN} min (lot : ${lot.id}).`);
    }
    await pause(INTERVALLE_SONDAGE_MS);
    const r = await appelAnthropic(`${URL_BATCHES}/${lot.id}`, { method: 'GET', headers: entetesAnthropic() });
    const etat = await r.json();
    if (etat.processing_status === 'ended' && etat.results_url) {
      urlResultats = etat.results_url;
      const c = etat.request_counts || {};
      console.log(`  [${libelle}] lot terminé en ${Math.round((Date.now() - debut) / 60000)} min (réussies : ${c.succeeded}, erreurs : ${c.errored}).`);
    }
  }

  const r = await appelAnthropic(urlResultats, { method: 'GET', headers: entetesAnthropic() });
  const texte = await r.text();
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) continue;
    let objet;
    try {
      objet = JSON.parse(ligne);
    } catch (e) {
      continue;
    }
    const resultat = objet.result || {};
    if (resultat.type === 'succeeded') {
      const contenu = (resultat.message?.content || []).map((b) => b.text || '').join('');
      resultats.set(objet.custom_id, { ok: true, texte: contenu, usage: resultat.message?.usage || {} });
    } else {
      resultats.set(objet.custom_id, { ok: false, erreur: resultat.error?.error?.message || resultat.type || 'inconnu' });
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
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_');
  return SENS_AUTORISES.includes(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Prompt 1 : sens de l'effet par fiche (prompt de production + deux règles)
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

ÉTAPE 2 — Sens du résultat, pour chaque problème, du point de vue de la consommation de ce que désigne la fiche (ou de l'adhésion au régime) :
- "favorable" : bénéfique pour ce problème (amélioration, risque diminué).
- "nul" : pas d'effet ni d'association significatifs.
- "defavorable" : néfaste (aggravation, risque augmenté, effets indésirables).
- "mitige" : résultats réellement contradictoires sur le critère principal de ce problème (études ou sous-groupes de sens opposés, effet présent à une dose et absent à une autre).
- "sans_objet" : l'étude ne permet pas de conclure sur ce problème, par exemple une étude qui décrit des consommations, des habitudes ou une fréquence sans mesurer l'effet de ce que désigne la fiche sur ce problème.

Règles :
- Le sens porte sur le fait de CONSOMMER ce que désigne la fiche, ou d'y être exposé. Exemples :
  • « réduire les produits de glycation améliore la santé » → "defavorable" pour la fiche Produits de glycation ;
  • « les sucres totaux ne sont pas associés au diabète » → "nul" pour la fiche Sucre ;
  • « une alimentation grasse et sucrée est néfaste, mais les légumes atténuent ce risque » → "favorable" pour la fiche Légumes ;
  • « un probiotique réduit l'exposition aux aflatoxines » → "sans_objet" pour la fiche Mycotoxines (l'étude n'évalue pas l'effet des mycotoxines elles-mêmes) et "favorable" pour la fiche du probiotique.
- Si l'étude mesure l'inverse de ce que désigne une fiche de régime (un indice d'alimentation PRO-inflammatoire pour un « régime anti-inflammatoire », une charge ACIDE pour un « régime alcalin », un index glycémique ÉLEVÉ pour un régime « à index glycémique bas »), inverse le sens pour cette fiche.
- Si l'étude porte sur un MANQUE, une carence ou un apport insuffisant de ce que désigne la fiche, juge le fait d'en consommer suffisamment : « un faible apport en fer est associé à davantage d'anémie » → "favorable" pour la fiche Fer.
- Si ce que désigne la fiche n'est que le point de comparaison d'une autre exposition qui n'est pas une fiche, juge la fiche elle-même : « le lait maternel protège mieux que le lait de vache » → "defavorable" pour la fiche Lait de vache.
- Juge chaque problème sur son CRITÈRE PRINCIPAL : celui qui définit le problème (par exemple le LDL-cholestérol pour le cholestérol, la densité osseuse ou les fractures pour l'ostéoporose), et un événement ou un symptôme clinique plutôt qu'un simple marqueur sanguin. Un effet net sur le critère principal reste "favorable" ou "defavorable" même si des critères secondaires ne bougent pas.
- Dans une comparaison : si B fait mieux que A, "favorable" pour B et "defavorable" pour A ; sans différence, "nul" pour les deux ; une fiche qui n'est qu'un simple comparateur sans résultat propre reçoit "sans_objet".
- Appuie-toi sur les résultats et les conclusions des auteurs, pas sur tes connaissances générales. Un résultat non significatif ou une simple tendance est "nul". Une absence d'association avec un risque est "nul", jamais "favorable". Une faible qualité des preuves ne change pas le sens.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après, sous l'une de ces deux formes (${problemes.length} valeur(s) par liste, dans l'ordre des numéros des problèmes) :
- étude commune : {"type": "commune", "sens": ${listeVide}}
- comparaison : {"type": "comparaison", "sens": {${exempleComparaison}}}`;
}

// ---------------------------------------------------------------------------
// Prompt 2 : classement par problème de santé (règle sur la maladie des participants corrigée)
// ---------------------------------------------------------------------------

function promptClassement(listeProblemes, titre, resume) {
  return `Tu classes une étude scientifique de nutrition selon les problèmes de santé qu'elle concerne, pour un site destiné aux professionnels de la nutrition.

Liste fermée des problèmes de santé (slug : intitulé) :
${listeProblemes}

Étude :
Titre : ${titre}
Résumé : ${resume}

Règles :
- Choisis uniquement les problèmes de santé qui sont le SUJET PRINCIPAL de l'étude : un critère de santé réellement MESURÉ ou évalué par l'étude (par exemple la glycémie pour le diabète, la tension pour l'hypertension).
- La maladie des participants ne compte que si l'étude mesure son évolution ou l'un de ses critères (par exemple la fonction rénale chez des patients atteints de maladie rénale). Si l'étude mesure autre chose chez ces patients (inflammation, qualité de vie, statut nutritionnel…), choisis le problème qui correspond à ce qui est mesuré.
- Un sous-groupe de participants (par exemple des personnes en surpoids) ne justifie jamais un problème de santé.
- N'ajoute PAS un problème pour un critère secondaire, un marqueur de sécurité ou de tolérance mesuré en complément, un facteur de risque évoqué, une complication possible ou une perspective de recherche.
- Choisis toujours le problème le PLUS PRÉCIS de la liste. Les catégories générales (maladies cardiovasculaires, autres cancers, infections et immunité, autres troubles digestifs, autres maladies neurologiques, peau, santé des yeux, obésité et poids, performance sportive) ne servent que si aucun problème plus précis ne convient.
- Dans la plupart des cas, un seul problème suffit ; deux ou trois seulement si l'étude porte réellement sur chacun d'eux à égalité.
- Le problème doit être nommé explicitement dans le titre ou le résumé comme objet de l'étude : ne le déduis jamais d'un mécanisme ou d'un sujet voisin.
- 0 à ${MAX_PROBLEMES_PAR_ETUDE} problèmes au maximum, du plus central au moins central.
- Utilise UNIQUEMENT des slugs de la liste, recopiés exactement.
- Si aucun problème de la liste ne correspond (étude sur la composition d'un aliment, les apports, les habitudes ou les connaissances, sans critère de santé), renvoie une liste vide.

Réponds UNIQUEMENT avec un objet JSON, rien avant ni après, au format :
{"problemes": ["slug-1", "slug-2"]}`;
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function lire(requete, description) {
  const { data, error } = await requete;
  if (error) throw new Error(`Lecture impossible (${description}) : ${error.message}`);
  return data || [];
}

async function main() {
  console.log('Test des prompts améliorés sur les cas de test_sondage. Rien ne sera enregistré.\n');

  // 1. Les cas du sondage
  const cas = await lire(
    supabase.from('test_sondage').select('n, fiche_type, fiche_id, etude_id, probleme_id, sens_actuel').order('n'),
    'test_sondage'
  );
  if (cas.length === 0) throw new Error('La table test_sondage est vide.');
  const idsEtudes = [...new Set(cas.map((c) => c.etude_id))];
  console.log(`${cas.length} cas, ${idsEtudes.length} étude(s) différente(s).`);

  // 2. Les problèmes de santé
  const problemes = await lire(supabase.from('problemes_sante').select('id, slug, nom, actif, ordre').order('ordre'), 'problemes_sante');
  const problemeParId = new Map(problemes.map((p) => [p.id, p]));
  const actifs = problemes.filter((p) => p.actif);
  const idParSlug = new Map(actifs.map((p) => [p.slug, p.id]));
  const listeProblemes = actifs.map((p) => `${p.slug} : ${p.nom}`).join('\n');

  // 3. Les études
  const etudes = await lire(
    supabase.from('etudes').select('id, titre_original, titre_traduit, resume_original, resume_simplifie, resume_reformule').in('id', idsEtudes),
    'etudes'
  );
  const etudeParId = new Map(etudes.map((e) => [e.id, e]));

  // 4. Les problèmes actuels de chaque étude
  const liensProblemes = await lire(
    supabase.from('etudes_problemes').select('etude_id, probleme_id').in('etude_id', idsEtudes),
    'etudes_problemes'
  );
  const problemesParEtude = new Map();
  for (const l of liensProblemes) {
    if (!problemesParEtude.has(l.etude_id)) problemesParEtude.set(l.etude_id, []);
    const p = problemeParId.get(l.probleme_id);
    if (p) problemesParEtude.get(l.etude_id).push(p);
  }

  // 5. Toutes les fiches de chaque étude (comme le fera la production)
  const fichesParEtude = new Map();
  for (const s of SOURCES) {
    const liens = await lire(supabase.from(s.liens).select(`${s.colonne}, etude_id`).in('etude_id', idsEtudes), s.liens);
    const idsFiches = [...new Set(liens.map((l) => l[s.colonne]))];
    if (idsFiches.length === 0) continue;
    const fiches = await lire(supabase.from(s.table).select('id, nom').in('id', idsFiches), s.table);
    const nomParId = new Map(fiches.map((f) => [f.id, f.nom]));
    for (const l of liens) {
      if (!nomParId.has(l[s.colonne])) continue;
      if (!fichesParEtude.has(l.etude_id)) fichesParEtude.set(l.etude_id, []);
      fichesParEtude.get(l.etude_id).push({ type: s.type, id: l[s.colonne], nom: nomParId.get(l[s.colonne]), libelle: s.libelle });
    }
  }

  // 6. Requêtes : une par étude pour le sens, une par étude pour le classement
  const requetesSens = [];
  const requetesClassement = [];
  const infosSens = new Map();
  for (const [i, id] of idsEtudes.entries()) {
    const e = etudeParId.get(id);
    if (!e) continue;
    const probs = problemesParEtude.get(id) || [];
    // Les fiches tirées au sort passent en premier, pour rester dans la limite de 26 lettres.
    const tirees = cas.filter((c) => c.etude_id === id).map((c) => `${c.fiche_type}:${c.fiche_id}`);
    const fiches = (fichesParEtude.get(id) || [])
      .sort((a, b) => (tirees.includes(`${b.type}:${b.id}`) ? 1 : 0) - (tirees.includes(`${a.type}:${a.id}`) ? 1 : 0))
      .slice(0, LETTRES.length);
    if (probs.length > 0 && fiches.length > 0) {
      requetesSens.push({
        id: `s-${i}`,
        maxTokens: 1200,
        prompt: promptSensFiches(e.titre_original || e.titre_traduit || '', e.resume_original || '', fiches, probs),
      });
      infosSens.set(id, { cle: `s-${i}`, fiches, probs });
    }
    requetesClassement.push({
      id: `c-${i}`,
      maxTokens: 150,
      prompt: promptClassement(listeProblemes, e.titre_traduit || e.titre_original || '', e.resume_simplifie || e.resume_reformule || ''),
    });
  }

  const [resSens, resClassement] = await Promise.all([
    executerLotClaude(requetesSens, 'Sens par fiche'),
    executerLotClaude(requetesClassement, 'Classement'),
  ]);

  let jetonsEntree = 0;
  let jetonsSortie = 0;
  for (const m of [resSens, resClassement]) {
    for (const r of m.values()) {
      if (r.ok) {
        jetonsEntree += r.usage.input_tokens || 0;
        jetonsSortie += r.usage.output_tokens || 0;
      }
    }
  }

  // 7. Résultats : sens
  console.log('\n##### SENS DE L\'EFFET : ancien → nouveau #####');
  let nbChanges = 0;
  for (const c of cas) {
    const e = etudeParId.get(c.etude_id);
    const info = infosSens.get(c.etude_id);
    const p = problemeParId.get(c.probleme_id);
    let nouveau = '(non évalué)';
    let nomFiche = '?';
    if (info) {
      const iFiche = info.fiches.findIndex((f) => f.type === c.fiche_type && f.id === c.fiche_id);
      const iProb = info.probs.findIndex((q) => q.id === c.probleme_id);
      nomFiche = iFiche >= 0 ? info.fiches[iFiche].nom : '?';
      const r = resSens.get(info.cle);
      if (!r || !r.ok) nouveau = '(échec)';
      else {
        try {
          const objet = extraireJSON(r.texte);
          const brut = Array.isArray(objet.sens) ? objet.sens : objet.sens?.[LETTRES[iFiche]];
          nouveau = (Array.isArray(brut) && iProb >= 0 && normaliserSens(brut[iProb])) || '(réponse illisible)';
          if (!Array.isArray(objet.sens)) nouveau += ' [comparaison]';
        } catch (err) {
          nouveau = '(réponse illisible)';
        }
      }
    }
    const change = !nouveau.startsWith(c.sens_actuel);
    if (change) nbChanges++;
    console.log(`${change ? '≠' : '='} ${nomFiche} / ${p ? p.nom : '?'} : ${c.sens_actuel} → ${nouveau}`);
    if (change) console.log(`      ${e ? e.titre_traduit : ''}`);
  }
  console.log(`\n${nbChanges} sens modifié(s) sur ${cas.length}.`);

  // 8. Résultats : classement
  console.log('\n##### CLASSEMENT PAR PROBLÈME : ancien → nouveau #####');
  let nbClassementsChanges = 0;
  for (const [i, id] of idsEtudes.entries()) {
    const e = etudeParId.get(id);
    if (!e) continue;
    const anciens = (problemesParEtude.get(id) || []).map((p) => p.nom).sort();
    let nouveaux = ['(échec)'];
    const r = resClassement.get(`c-${i}`);
    if (r && r.ok) {
      try {
        const slugs = extraireJSON(r.texte).problemes || [];
        nouveaux = [...new Set(slugs.filter((s) => idParSlug.has(s)))]
          .slice(0, MAX_PROBLEMES_PAR_ETUDE)
          .map((s) => problemeParId.get(idParSlug.get(s)).nom)
          .sort();
      } catch (err) {
        nouveaux = ['(réponse illisible)'];
      }
    }
    const change = anciens.join('|') !== nouveaux.join('|');
    if (change) nbClassementsChanges++;
    console.log(`${change ? '≠' : '='} ${e.titre_traduit}`);
    if (change) {
      console.log(`      avant : ${anciens.join(' · ') || '(aucun)'}`);
      console.log(`      après : ${nouveaux.join(' · ') || '(aucun)'}`);
    }
  }
  console.log(`\n${nbClassementsChanges} classement(s) modifié(s) sur ${idsEtudes.length} étude(s).`);

  const cout = (jetonsEntree * PRIX_ENTREE_PAR_MILLION + jetonsSortie * PRIX_SORTIE_PAR_MILLION) / 1e6;
  console.log('\n##### Bilan #####');
  console.log(`Jetons : ${jetonsEntree} en entrée, ${jetonsSortie} en sortie`);
  console.log(`Coût réel de ce test : ${cout.toFixed(3)} $`);
  console.log('Rien n\'a été enregistré en base.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
