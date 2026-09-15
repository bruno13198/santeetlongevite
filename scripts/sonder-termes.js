// Sonde Europe PMC pour mesurer la littérature réellement disponible
// derrière un terme de recherche, indépendamment de ce que le pipeline
// a importé. Sert à décider si une fiche mérite d'exister séparément,
// sur des faits plutôt que sur les études déjà en base (qui reflètent
// surtout la configuration des termes, pas la littérature).
//
// N'écrit rien : affiche un rapport.
//
// Variables d'environnement :
//   TERMES : termes à sonder, séparés par des points-virgules
//            ex: "kidney bean;navy bean;Phaseolus vulgaris"

const ANNEES = 10;

function formaterDate(date) {
  return date.toISOString().split('T')[0];
}

async function sonder(terme) {
  const dateDebut = new Date();
  dateDebut.setFullYear(dateDebut.getFullYear() - ANNEES);

  const filtreDate = `AND (FIRST_PDATE:[${formaterDate(dateDebut)} TO ${formaterDate(new Date())}])`;
  const filtrePubType = `(PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial")`;

  const requete = `(TITLE:"${terme}" OR ABSTRACT:"${terme}") AND (SRC:MED) AND ${filtrePubType} ${filtreDate}`;

  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=25&resultType=core`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC ${res.status}`);

  const data = await res.json();
  const total = data.hitCount;
  const resultats = data.resultList?.result || [];

  return { total, resultats };
}

async function main() {
  const termesBruts = process.env.TERMES;
  if (!termesBruts) {
    console.log('TERMES est vide. Exemple : "kidney bean;navy bean"');
    return;
  }

  const termes = termesBruts.split(';').map((t) => t.trim()).filter(Boolean);

  for (const terme of termes) {
    try {
      const { total, resultats } = await sonder(terme);
      console.log(`\n=== "${terme}" : ${total} étude(s) sur ${ANNEES} ans ===`);

      resultats.slice(0, 10).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.title}`);
        console.log(`     ${r.journalTitle || '?'} · ${r.firstPublicationDate || '?'} · PMID ${r.pmid || '?'}`);
      });

      if (resultats.length === 0) {
        console.log('  (aucun résultat)');
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      console.log(`\n=== "${terme}" : erreur — ${e.message}`);
    }
  }

  console.log('\nTerminé.');
}

main();
