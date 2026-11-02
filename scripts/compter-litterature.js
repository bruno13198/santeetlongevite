// Comptage de la littérature sur Europe PMC pour des fiches existantes.
// AUCUN appel Claude : uniquement des requêtes Europe PMC (gratuites). Coût : 0 €.
//
// Même recherche que les imports : termes de la fiche (« A + B » = les deux exigés),
// MEDLINE, mots exclus des titres (fichier partagé mots-exclus-titre.js), fenêtre de dates.
//
// Variables d'environnement :
//   SLUGS          slugs séparés par des virgules (ignoré si TOUTES=true)
//   TOUTES         true = toutes les fiches actives (aliments, régimes, nutriments)
//   HAUTS_NIVEAUX  true = seulement méta-analyses, revues systématiques et essais randomisés
//   JOURS          fenêtre en jours (3650 par défaut)
//
// Mode normal : deux chiffres par fiche (total, et résultats chez l'homme).
// Mode hauts niveaux : un seul chiffre par fiche (études de haut niveau), plus rapide.

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { clauseExclusion } = require('./mots-exclus-titre');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const URL_EUROPEPMC_POST = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';
const JOURS = parseInt(process.env.JOURS || '3650', 10);
const TOUTES = process.env.TOUTES === 'true';
const HAUTS_NIVEAUX = process.env.HAUTS_NIVEAUX === 'true';
const SLUGS = (process.env.SLUGS || '').split(',').map((s) => s.trim()).filter(Boolean);

const FILTRE_HUMAIN =
  '(ABSTRACT:(participants OR patients OR subjects OR adults OR children OR women OR men OR volunteers OR humans))';
const EXCLUSIONS_ANIMAL =
  'NOT TITLE:(rat OR rats OR mice OR mouse OR murine OR "in vitro" OR zebrafish OR broiler OR broilers OR piglets OR cattle OR cows OR sheep OR poultry OR dogs OR cats)';
const FILTRE_HAUTS_NIVEAUX =
  '(PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Randomized Controlled Trial")';

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formaterDate(date) {
  return date.toISOString().split('T')[0];
}

// Même construction que les imports : « A + B » exige les deux expressions.
function expression(terme) {
  const parties = String(terme).split('+').map((p) => p.trim()).filter(Boolean);
  return `(${parties.map((p) => `(TITLE:"${p}" OR ABSTRACT:"${p}")`).join(' AND ')})`;
}

// Liste de toutes les fiches actives des trois tables.
async function listerToutesLesFiches() {
  const slugs = [];
  for (const table of ['aliments', 'habitudes_alimentaires', 'nutriments']) {
    const { data, error } = await supabase.from(table).select('slug').eq('actif', true).range(0, 4999);
    if (error) throw new Error(`${table} : ${error.message}`);
    slugs.push(...data.map((d) => d.slug));
  }
  return slugs;
}

// Retrouve la fiche dans les trois tables et construit sa requête « sujet ».
async function chercherFiche(slug) {
  const { data: a } = await supabase.from('aliments').select('nom, termes_recherche').eq('slug', slug).maybeSingle();
  if (a) return { type: 'aliment', nom: a.nom, sujet: (a.termes_recherche || []).map(expression).join(' OR ') };

  for (const table of ['habitudes_alimentaires', 'nutriments']) {
    const { data: f } = await supabase
      .from(table).select('nom, terme_recherche, est_terme_mesh, termes_texte').eq('slug', slug).maybeSingle();
    if (f) {
      const parties = [];
      if (f.terme_recherche && f.terme_recherche.trim() !== '') {
        parties.push(f.est_terme_mesh ? `(MESH:"${f.terme_recherche}")` : expression(f.terme_recherche.split(' ').join(' + ')));
      }
      for (const t of f.termes_texte || []) if (t && t.trim() !== '') parties.push(expression(t));
      return { type: table === 'nutriments' ? 'nutriment' : 'régime', nom: f.nom, sujet: parties.join(' OR ') };
    }
  }
  return null;
}

async function compter(requete, tentative = 1) {
  try {
    const res = await fetch(URL_EUROPEPMC_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new
