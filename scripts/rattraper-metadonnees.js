// Rattrapage des métadonnées bibliographiques des études (28 oct. 2026, mode « compléter » le 29 oct.).
//
// Interroge Europe PMC (gratuit, sans Claude) par lots de 100 et remplit : revue, revue_abregee,
// volume, numero, pages, doi. Ces informations servent aux références complètes (Vancouver, Zotero).
//
// Deux modes (variable MODE) :
//   nouvelles (défaut) : études sans revue ni DOI (lancé chaque lundi après l'import)
//   completer          : études qui ont une revue mais pas encore de volume ni de pages
//                        (publiées en ligne avant parution) ; seuls les champs trouvés sont écrits,
//                        rien n'est effacé (lancé une fois par mois)
//
// Variables d'environnement :
//   MODE     'nouvelles' ou 'completer'
//   ECRIRE   'true' pour enregistrer en base ; sinon test : affiche des exemples et les comptes
//   LIMITE   nombre maximal d'études traitées (toutes par défaut)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const URL_EUROPE_PMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/searchPOST';
const TAILLE_LOT = 100;
const MODE = process.env.MODE === 'completer' ? 'completer' : 'nouvelles';
const ECRIRE = process.env.ECRIRE === 'true';
const LIMITE = parseInt(process.env.LIMITE || '1000000', 10);

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Source et identifiant Europe PMC d'une étude, tirés de son adresse (…/article/MED/21473867).
function identifiant(etude) {
  const m = String(etude.url_originale || '').match(/\/article\/([A-Z]+)\/([^/?#]+)/);
  if (m) return { source: m[1], id: m[2] };
  if (/^\d+$/.test(String(etude.source_id || ''))) return { source: 'MED', id: String(etude.source_id) };
  return null;
}

async function chargerEtudes() {
  const etudes = [];
  for (let debut = 0; etudes.length < LIMITE; debut += 1000) {
    let requete = supabase.from('etudes').select('id, url_originale, source_id');
    requete = MODE === 'completer'
      ? requete.not('revue', 'is', null).is('volume', null).is('pages', null)
      : requete.is('revue', null).is('doi', null);
    const { data, error } = await requete.order('id').range(debut, debut + 999);
    if (error) throw new Error(`Lecture des études impossible : ${error.message}`);
    if (!data || data.length === 0) break;
    etudes.push(...data);
    if (data.length < 1000) break;
  }
  return etudes.slice(0, LIMITE);
}

async function interrogerEuropePmc(source, ids, tentative = 1) {
  const requete = `(${ids.map((id) => `EXT_ID:${id}`).join(' OR ')}) AND SRC:${source}`;
  const corps = new URLSearchParams({ query: requete, resultType: 'core', format: 'json', pageSize: String(TAILLE_LOT) });
  try {
    const res = await fetch(URL_EUROPE_PMC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps.toString(),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      if ([429, 500, 502, 503, 504].includes(res.status) && tentative < 5) {
        await pause(5000 * tentative);
        return interrogerEuropePmc(source, ids, tentative + 1);
      }
      throw new Error(`Europe PMC erreur ${res.status}`);
    }
    const data = await res.json();
    return data.resultList?.result || [];
  } catch (e) {
    if (tentative < 5) {
      await pause(5000 * tentative);
      return interrogerEuropePmc(source, ids, tentative + 1);
    }
    throw e;
  }
}

function metadonnees(r) {
  const journal = r.journalInfo?.journal || {};
  const valeur = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
  return {
    revue: valeur(journal.title || r.journalTitle),
    revue_abregee: valeur(journal.isoabbreviation || journal.medlineAbbreviation || r.journalTitle),
    volume: valeur(r.journalInfo?.volume || r.journalVolume),
    numero: valeur(r.journalInfo?.issue || r.issue),
    pages: valeur(r.pageInfo),
    doi: valeur(r.doi),
  };
}

// Ne garde que les champs renseignés : on n'efface jamais une valeur déjà en base.
function champsTrouves(m) {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null));
}

async function main() {
  console.log(`Rattrapage des métadonnées (mode ${MODE}) : ${ECRIRE ? 'ENREGISTREMENT en base' : 'test sans enregistrement'}.`);
  const etudes = await chargerEtudes();
  console.log(
    MODE === 'completer'
      ? `${etudes.length} étude(s) avec revue mais sans volume ni pages.`
      : `${etudes.length} étude(s) sans revue ni DOI.`
  );

  // Regroupement par source (MED, PMC, PPR…), car une requête ne vise qu'une source.
  const parSource = new Map();
  let sansIdentifiant = 0;
  for (const e of etudes) {
    const ident = identifiant(e);
    if (!ident) { sansIdentifiant++; continue; }
    if (!parSource.has(ident.source)) parSource.set(ident.source, []);
    parSource.get(ident.source).push({ etude: e, id: ident.id });
  }

  let trouvees = 0;
  let introuvables = 0;
  let enAttente = 0;
  let enregistrees = 0;
  let echecs = 0;
  let exemples = 0;

  for (const [source, liste] of parSource) {
    console.log(`\nSource ${source} : ${liste.length} étude(s).`);
    for (let i = 0; i < liste.length; i += TAILLE_LOT) {
      const lot = liste.slice(i, i + TAILLE_LOT);
      let resultats;
      try {
        resultats = await interrogerEuropePmc(source, lot.map((x) => x.id));
      } catch (e) {
        console.log(`  ! Lot ${i / TAILLE_LOT + 1} en échec : ${e.message}`);
        echecs += lot.length;
        continue;
      }
      const parId = new Map(resultats.map((r) => [String(r.id), r]));

      for (const { etude, id } of lot) {
        const r = parId.get(id);
        if (!r) { introuvables++; continue; }
        const m = metadonnees(r);

        if (MODE === 'completer') {
          // Toujours pas de volume ni de pages : l'étude n'est pas encore parue, on réessaiera.
          if (!m.volume && !m.pages) { enAttente++; continue; }
        } else if (!m.revue && !m.doi) {
          introuvables++;
          continue;
        }
        trouvees++;

        if (exemples < 10) {
          console.log(`  ${id} → ${m.revue_abregee || m.revue} ${m.volume || ''}(${m.numero || ''}):${m.pages || ''} doi:${m.doi || '-'}`);
          exemples++;
        }

        if (ECRIRE) {
          const { error } = await supabase.from('etudes').update(champsTrouves(m)).eq('id', etude.id);
          if (error) { echecs++; console.log(`  ! ${etude.id} : ${error.message}`); }
          else enregistrees++;
        }
      }
      if ((i / TAILLE_LOT) % 10 === 9) console.log(`  … ${Math.min(i + TAILLE_LOT, liste.length)} / ${liste.length}`);
      await pause(300);
    }
  }

  console.log('\n##### Bilan #####');
  console.log(`Études examinées : ${etudes.length} | métadonnées trouvées : ${trouvees} | introuvables : ${introuvables} | sans identifiant : ${sansIdentifiant}`);
  if (MODE === 'completer') console.log(`Toujours sans volume ni pages (à revoir le mois prochain) : ${enAttente}`);
  console.log(`Enregistrées : ${enregistrees} | échecs : ${echecs}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
