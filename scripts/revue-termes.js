// Revue des termes de recherche (8 nov. 2026). Script ponctuel, sans aucune écriture en base :
// à supprimer avec son workflow une fois la revue terminée.
// 1. Lit toutes les fiches actives (aliments, habitudes, nutriments) et leurs termes actuels.
// 2. Demande à Sonnet (API Message Batches) des termes supplémentaires pour chaque fiche :
//    « titre seul », expressions (titre ou résumé), couples « A + B ».
// 3. Mesure sur Europe PMC, pour chaque fiche, le nombre de méta-analyses sur dix ans et le volume
//    d'une semaine de veille (mots exclus appliqués) : avec les termes actuels, avec les termes
//    proposés, et en version « large » (termes « titre seul » cherchés aussi dans le résumé).
// 4. Signale les termes proposés qui appartiennent aussi à une autre fiche.
// Fichiers produits : propositions.json (dès la fin du lot Sonnet) et revue-termes.csv.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LIMITE_FICHES = parseInt(process.env.LIMITE_FICHES || '0', 10); // 0 = toutes les fiches
const MODELE = 'claude-sonnet-5';
const URL_BATCHES = 'https://api.anthropic.com/v1/messages/batches';
const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';

// Mots exclus partagés par les scripts d'import (fichier commun), avec une liste de secours.
let MOTS_EXCLUS_TITRE = ['mice', 'mouse', 'murine', 'rat', 'rats', 'rodent', 'rodents', 'in silico', 'cell line'];
let MARQUEURS_HUMAINS = [
  'human', 'humans', 'men', 'women', 'adult', 'adults', 'older adults', 'elderly',
  'children', 'adolescents', 'infants', 'patients', 'participants', 'volunteers',
  'subjects', 'trial', 'randomized', 'randomised',
];
try {
  const commun = require('./mots-exclus-titre');
  const liste = Array.isArray(commun) ? commun : commun.MOTS_EXCLUS_TITRE;
  if (Array.isArray(liste) && liste.length > 0) MOTS_EXCLUS_TITRE = liste;
  if (Array.isArray(commun.MARQUEURS_HUMAINS)) MARQUEURS_HUMAINS = commun.MARQUEURS_HUMAINS;
} catch (e) {
  console.log('⚠️ mots-exclus-titre.js illisible, liste de secours utilisée :', e.message);
}

const FILTRE_HAUTS_NIVEAUX =
  'AND (PUB_TYPE:"Meta-Analysis" AND (ABSTRACT:"randomized controlled trials" OR ABSTRACT:"randomised controlled trials" OR ABSTRACT:"randomized controlled trial" OR ABSTRACT:"randomised controlled trial" OR ABSTRACT:"randomized trials" OR ABSTRACT:"randomised trials" OR ABSTRACT:"RCTs" OR ABSTRACT:"prospective cohort studies" OR ABSTRACT:"prospective cohort study" OR ABSTRACT:"prospective cohorts" OR ABSTRACT:"prospective studies"))';

const LIBELLES_TYPES = {
  aliment: 'un aliment, une boisson, un additif ou un contaminant',
  habitude: 'un régime, une habitude ou un mode alimentaire',
  nutriment: 'un nutriment, un complément alimentaire ou une plante',
};

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nettoyerTerme(t) {
  return String(t || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
}

function cleTerme(t) {
  return nettoyerTerme(t).replace(/^titre:\s*/i, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Lecture des fiches
// ---------------------------------------------------------------------------

async function lireTable(table) {
  const lignes = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(debut, debut + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    lignes.push(...data);
    if (data.length < 1000) break;
  }
  return lignes;
}

async function lireFiches() {
  const sources = [
    { type: 'aliment', table: 'aliments', colonne: 'termes_recherche' },
    { type: 'habitude', table: 'habitudes_alimentaires', colonne: 'termes_texte' },
    { type: 'nutriment', table: 'nutriments', colonne: 'termes_texte' },
  ];
  const fiches = [];
  for (const s of sources) {
    for (const r of await lireTable(s.table)) {
      if (r.actif === false) continue;
      const termes = Array.isArray(r[s.colonne]) ? r[s.colonne].map(nettoyerTerme).filter(Boolean) : [];
      let mesh = null;
      if (r.terme_recherche && String(r.terme_recherche).trim()) {
        if (r.est_terme_mesh) mesh = nettoyerTerme(r.terme_recherche);
        else termes.push(nettoyerTerme(r.terme_recherche));
      }
      fiches.push({
        type: s.type,
        slug: r.slug,
        nom: r.nom,
        categorie: r.categorie || '',
        description: String(r.description || '').slice(0, 600),
        termes: [...new Set(termes)],
        mesh,
      });
    }
  }
  return fiches;
}

// ---------------------------------------------------------------------------
// Propositions de Sonnet (API Message Batches)
// ---------------------------------------------------------------------------

function promptPropositions(f) {
  return `Tu aides à améliorer la recherche d'études scientifiques sur Europe PMC pour la fiche suivante d'un site francophone de veille en nutrition. La fiche porte sur ${LIBELLES_TYPES[f.type]}.

Nom de la fiche : ${f.nom}
${f.categorie ? `Catégorie : ${f.categorie}\n` : ''}${f.description ? `Description : ${f.description}\n` : ''}Termes de recherche actuels : ${f.termes.length ? f.termes.map((t) => `« ${t} »`).join(', ') : 'aucun'}

Les termes actuels sont des expressions exactes, cherchées dans le titre ou le résumé. Ils ratent des études pertinentes, en particulier celles dont le titre nomme simplement le sujet (« Probiotics for… », « Vitamin E for Alzheimer's dementia », « Effect of alcohol on blood pressure »).

Propose des termes SUPPLÉMENTAIRES, en anglais (langue des études), dans trois catégories :

1. "titre" : noms qui, présents dans le TITRE d'une étude, signifient presque toujours qu'elle porte sur le sujet de la fiche. Nom courant anglais, pluriel s'il diffère, nom scientifique ou latin, noms standardisés d'extraits très étudiés, abréviation seulement si elle est sans ambiguïté en nutrition humaine. Ces termes ne seront cherchés que dans le titre.
2. "expressions" : formulations de plusieurs mots, cherchées dans le titre ou le résumé, typiques d'une étude sur la consommation ou la prise de ce sujet (par exemple « X supplementation », « X intake », « dietary X », « X consumption »).
3. "couples" : pour un nom ambigu dont le mot seul désigne aussi autre chose (un médicament, une perfusion, un réactif, un dosage sanguin, un autre sens du mot), une paire « nom + précision » dont les deux parties doivent figurer ensemble dans le titre ou le résumé, par exemple « iron + supplementation » ou « vitamin D + supplementation ».

Règles :
- Respecte exactement le périmètre de la fiche : si son nom précise une forme, un contexte, une population ou une restriction, les termes doivent la respecter (au besoin par des couples).
- Pour un aliment au nom détaillé (par exemple « Riz basmati, cuit, sans sel ajouté »), vise l'aliment lui-même (« basmati rice ») et ignore les précisions de préparation.
- Pour un additif ou un contaminant, donne le nom chimique, les synonymes courants et le numéro E s'il existe.
- Ne propose pas un terme qui désigne une catégorie plus large que la fiche (pour « Pomme », pas « fruit ») ni un terme qui désigne surtout un autre sujet.
- Ne propose pas un terme qui désigne une variante, une forme particulière ou un sujet voisin susceptible d'avoir sa propre fiche sur le site (pour « Jeûne intermittent », pas « Ramadan fasting » ; pour « Polyphénols », pas « flavonoids » ; pour « Boissons sucrées », pas « energy drinks »).
- Ne répète aucun terme actuel. Pas de termes en français. Pas de guillemets doubles.
- Au plus 6 termes "titre", 6 "expressions" et 4 "couples". Moins si le sujet est simple : la qualité compte plus que le nombre.
- Dans "ambigus", signale chacun de tes termes qui risque de ramener beaucoup d'études hors sujet, avec une raison de 8 mots au plus. "remarque" : une phrase courte, seulement si nécessaire.

Réponds UNIQUEMENT avec un objet JSON, rien avant, rien après :
{"titre": ["..."], "expressions": ["..."], "couples": ["... + ..."], "ambigus": [{"terme": "...", "raison": "..."}], "remarque": "une phrase en français si la fiche pose un problème particulier, sinon vide"}`;
}

function entetes() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

async function appelAnthropic(url, options, tentative = 1) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
    if (!res.ok) {
      if ([429, 500, 502, 503, 504, 529].includes(res.status) && tentative < 5) throw new Error(`erreur ${res.status}`);
      throw Object.assign(new Error(`API Anthropic erreur ${res.status} : ${(await res.text()).slice(0, 300)}`), { definitive: true });
    }
    return res;
  } catch (e) {
    if (e.definitive || tentative >= 5) throw e;
    await pause(5000 * tentative);
    return appelAnthropic(url, options, tentative + 1);
  }
}

// Envoie un lot, attend sa fin, renvoie Map custom_id -> texte, et le total des jetons.
async function executerLot(requetes) {
  const res = await appelAnthropic(URL_BATCHES, {
    method: 'POST',
    headers: entetes(),
    body: JSON.stringify({
      requests: requetes.map((r) => ({
        custom_id: r.id,
                params: { model: MODELE, max_tokens: 2000, messages: [{ role: 'user', content: r.prompt }] },
      })),
    }),
  });
  const lot = await res.json();
  console.log(`  Lot ${lot.id} envoyé (${requetes.length} requêtes).`);

  const debut = Date.now();
  let urlResultats = null;
  while (!urlResultats) {
    if (Date.now() - debut > 180 * 60000) throw new Error(`Lot ${lot.id} non terminé après 3 h.`);
    await pause(30000);
    const etat = await (await appelAnthropic(`${URL_BATCHES}/${lot.id}`, { method: 'GET', headers: entetes() })).json();
    if (etat.processing_status === 'ended') {
      urlResultats = etat.results_url;
      console.log(`  Lot terminé en ${Math.round((Date.now() - debut) / 60000)} min (réussies : ${etat.request_counts?.succeeded}, erreurs : ${etat.request_counts?.errored}).`);
    }
  }

  const textes = new Map();
  const jetons = { entree: 0, sortie: 0 };
  const contenu = await (await appelAnthropic(urlResultats, { method: 'GET', headers: entetes() })).text();
  for (const ligne of contenu.split('\n')) {
    if (!ligne.trim()) continue;
    let objet;
    try {
      objet = JSON.parse(ligne);
    } catch (e) {
      continue;
    }
    if (objet.result?.type === 'succeeded') {
      const message = objet.result.message;
      textes.set(objet.custom_id, (message.content || []).map((b) => b.text || '').join(''));
      jetons.entree += message.usage?.input_tokens || 0;
      jetons.sortie += message.usage?.output_tokens || 0;
    }
  }
  return { textes, jetons };
}

function interpreter(texte, f) {
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
  const objet = JSON.parse(match ? match[0] : nettoye);
  const dejaLa = new Set(f.termes.map(cleTerme));
  const vus = new Set();
  const garder = (liste, max) =>
    (Array.isArray(liste) ? liste : [])
      .map(nettoyerTerme)
      .filter((t) => t && t.length <= 80 && !dejaLa.has(cleTerme(t)) && !vus.has(cleTerme(t)) && vus.add(cleTerme(t)))
      .slice(0, max);
  return {
    titre: garder(objet.titre, 6),
    expressions: garder(objet.expressions, 6),
    couples: garder(objet.couples, 4).filter((t) => t.includes('+')),
    ambigus: Array.isArray(objet.ambigus) ? objet.ambigus.map((a) => `${a.terme} (${a.raison})`).join(' ; ') : '',
    remarque: typeof objet.remarque === 'string' ? objet.remarque : '',
  };
}

// ---------------------------------------------------------------------------
// Mesure sur Europe PMC (nombre de résultats seulement)
// ---------------------------------------------------------------------------

function partiePhrase(m) {
  return `(TITLE:"${m}" OR ABSTRACT:"${m}")`;
}

// « titre:X » : X dans le titre seul (ou titre et résumé en version large) ; « A + B » : les deux ;
// sinon : l'expression dans le titre ou le résumé (comme les scripts d'import).
function filtreTerme(terme, large) {
  const t = nettoyerTerme(terme);
  if (/^titre:/i.test(t)) {
    const m = t.replace(/^titre:\s*/i, '');
    return large ? partiePhrase(m) : `(TITLE:"${m}")`;
  }
  const morceaux = t.split('+').map((s) => s.trim()).filter(Boolean);
  return `(${morceaux.map(partiePhrase).join(' AND ')})`;
}

function construireFiltre(termes, mesh, large) {
  const parties = [];
  if (mesh) parties.push(`(MESH:"${mesh}")`);
  for (const t of termes) if (nettoyerTerme(t)) parties.push(filtreTerme(t, large));
  return parties.join(' OR ');
}

const EXCLUSION =
  `NOT ((${MOTS_EXCLUS_TITRE.map((m) => `TITLE:"${m}"`).join(' OR ')}) ` +
  `AND NOT (${MARQUEURS_HUMAINS.map((m) => `TITLE:"${m}"`).join(' OR ')}))`;

function dateIso(joursAvant) {
  const d = new Date();
  d.setDate(d.getDate() - joursAvant);
  return d.toISOString().split('T')[0];
}

async function compter(filtre, hautsNiveaux, jours, tentative = 1) {
  if (!filtre) return 0;
  const requete = `(${filtre}) AND (SRC:MED) ${hautsNiveaux ? FILTRE_HAUTS_NIVEAUX : ''} ${EXCLUSION} AND (FIRST_IDATE:[${dateIso(jours)} TO ${dateIso(0)}])`;
  try {
    const res = await fetch(URL_EUROPEPMC_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: requete, format: 'json', pageSize: '1', resultType: 'idlist' }).toString(),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
    return (await res.json()).hitCount || 0;
  } catch (e) {
    if (tentative < 4) {
      await pause(4000 * tentative);
      return compter(filtre, hautsNiveaux, jours, tentative + 1);
    }
    console.log(`  Mesure impossible : ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

function champCsv(v) {
  return `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;
}

async function main() {
  let fiches = await lireFiches();
  console.log(`${fiches.length} fiches actives (aliments, habitudes, nutriments).`);
  if (LIMITE_FICHES > 0) {
    // Échantillon réparti sur les trois types pour le test
    const parType = ['aliment', 'habitude', 'nutriment'].map((t) => fiches.filter((f) => f.type === t));
    const echantillon = [];
    for (let i = 0; echantillon.length < LIMITE_FICHES && i < fiches.length; i++) {
      for (const liste of parType) if (liste[i * 7] && echantillon.length < LIMITE_FICHES) echantillon.push(liste[i * 7]);
    }
    fiches = echantillon;
    console.log(`Mode test : ${fiches.length} fiches.`);
  }

  // 1. Propositions
  console.log('\n##### Propositions de Sonnet #####');
  const requetes = fiches.map((f, i) => ({ id: `f${i}`, prompt: promptPropositions(f) }));
  let { textes, jetons } = await executerLot(requetes);
  const aRefaire = requetes.filter((r) => {
    const t = textes.get(r.id);
    if (!t) return true;
    try {
      interpreter(t, fiches[Number(r.id.slice(1))]);
      return false;
    } catch (e) {
      return true;
    }
  });
  if (aRefaire.length > 0) {
    console.log(`  ${aRefaire.length} réponse(s) à refaire.`);
    const second = await executerLot(aRefaire);
    for (const [id, t] of second.textes) textes.set(id, t);
    jetons.entree += second.jetons.entree;
    jetons.sortie += second.jetons.sortie;
  }
  fiches.forEach((f, i) => {
    try {
      f.propositions = interpreter(textes.get(`f${i}`) || '', f);
    } catch (e) {
      f.propositions = { titre: [], expressions: [], couples: [], ambigus: '', remarque: 'échec de la proposition' };
    }
  });
  fs.writeFileSync('propositions.json', JSON.stringify(fiches, null, 1), 'utf8');
  const cout = (jetons.entree * 1.5 + jetons.sortie * 7.5) / 1e6;
  console.log(`  Jetons : ${jetons.entree} en entrée, ${jetons.sortie} en sortie (coût estimé : ${cout.toFixed(2)} $, tarif lot de Sonnet supposé).`);

    // 2. Termes partagés avec une autre fiche (actuels ou proposés) : terme identique, ou l'un contient
  //    l'autre mot pour mot (« flavonoids » et « dietary flavonoids »). Pour un couple, seule sa
  //    première partie (le sujet) est comparée.
  const coeur = (t) => cleTerme(t).split('+')[0].trim();
  const tousTermes = [];
  for (const f of fiches) {
    for (const t of [...f.termes, ...f.propositions.titre, ...f.propositions.expressions, ...f.propositions.couples]) {
      if (coeur(t).length >= 4) tousTermes.push({ cle: ` ${coeur(t)} `, slug: f.slug });
    }
  }
  function fichesPartagees(terme, slug) {
    const cle = ` ${coeur(terme)} `;
    if (cle.trim().length < 4) return [];
    const autres = new Set();
    for (const x of tousTermes) {
      if (x.slug !== slug && (x.cle.includes(cle) || cle.includes(x.cle))) autres.add(x.slug);
    }
    return [...autres];
  }

  // 3. Mesures
  console.log('\n##### Mesures sur Europe PMC #####');
  const lignes = [[
    'type', 'slug', 'nom', 'termes_actuels', 'titre', 'expressions', 'couples', 'ambigus', 'remarque',
    'ma10_actuel', 'ma10_propose', 'ma10_large', 'semaine_actuel', 'semaine_propose', 'semaine_large', 'termes_partages',
  ].join(',')];
  for (let i = 0; i < fiches.length; i++) {
    const f = fiches[i];
    const p = f.propositions;
    const proposes = [...f.termes, ...p.titre.map((t) => `titre:${t}`), ...p.expressions, ...p.couples];
    const [maActuel, maPropose, maLarge, semActuel, semPropose, semLarge] = await Promise.all([
      compter(construireFiltre(f.termes, f.mesh, false), true, 3650),
      compter(construireFiltre(proposes, f.mesh, false), true, 3650),
      compter(construireFiltre(proposes, f.mesh, true), true, 3650),
      compter(construireFiltre(f.termes, f.mesh, false), false, 7),
      compter(construireFiltre(proposes, f.mesh, false), false, 7),
      compter(construireFiltre(proposes, f.mesh, true), false, 7),
    ]);
        const partages = [...p.titre, ...p.expressions, ...p.couples]
      .map((t) => {
        const autres = fichesPartagees(t, f.slug);
        return autres.length ? `${t} → ${autres.slice(0, 5).join(' | ')}${autres.length > 5 ? ' …' : ''}` : null;
      })
      .filter(Boolean)
      .join(' ; ');
    lignes.push([
      f.type, f.slug, f.nom, f.termes.join(' | '), p.titre.join(' | '), p.expressions.join(' | '), p.couples.join(' | '),
      p.ambigus, p.remarque, maActuel, maPropose, maLarge, semActuel, semPropose, semLarge, partages,
    ].map(champCsv).join(','));
    if ((i + 1) % 25 === 0 || i === fiches.length - 1) {
      console.log(`  ${i + 1} / ${fiches.length} fiches mesurées.`);
      fs.writeFileSync('revue-termes.csv', lignes.join('\n'), 'utf8'); // sauvegarde au fil de l'eau
    }
    await pause(300);
  }
  fs.writeFileSync('revue-termes.csv', lignes.join('\n'), 'utf8');
  console.log('\nTerminé. Fichiers propositions.json et revue-termes.csv prêts (artefact « revue-termes »).');
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
