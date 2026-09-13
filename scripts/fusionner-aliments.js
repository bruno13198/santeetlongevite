// Fusionne des fiches aliments en doublon : transfère les liens etudes et
// candidats_rejetes vers une fiche conservée, puis désactive les absorbées.
// Les fiches absorbées restent en base (actif = false) : réversible.
//
// Chaque groupe est défini par le slug à garder et ceux à absorber.
// MODE_SIMULATION=true (défaut) : affiche ce qui serait fait, sans rien écrire.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODE_SIMULATION = (process.env.MODE_SIMULATION || 'true') !== 'false';

const GROUPES = [
  { garder: 'pain-complet-ou-integral-a-la-farine-t150', absorber: ['pain-bis-a-la-farine-t80-ou-t110','pain-aux-cereales-et-ou-graines'] },
  { garder: 'pain-blanc-par-ex-baguette-boule', absorber: ['pain-bagel','pain-panini','pain-pita','bretzel-pain-frais'] },
  { garder: 'pain-au-levain', absorber: ['pain-de-campagne'] },
  { garder: 'biscotte-au-germe-de-ble', absorber: ['biscotte-classique','biscotte-sans-sel-ajoute','biscotte-au-ble-complet','biscotte-aux-cereales','petit-pain-grille-suedois-au-ble-complet','petit-pain-grille-suedois-au-froment','petit-pain-grille-suedois-aux-cereales-et-graines','tartine-croustillante-au-seigle-source-ou-riche-en-fibres','tartine-craquante-extrudees-source-ou-riche-en-fibres','tartine-craquante-extrudee-classique'] },
];

async function recupererAliment(slug) {
  const { data, error } = await supabase
    .from('aliments')
    .select('id, nom, slug, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`Erreur récupération ${slug}: ${error.message}`);
  return data;
}

async function etudesDe(alimentId) {
  const { data, error } = await supabase
    .from('aliments_etudes')
    .select('etude_id')
    .eq('aliment_id', alimentId);

  if (error) throw new Error(`Erreur études: ${error.message}`);
  return data.map((l) => l.etude_id);
}

async function rejetesDe(alimentId) {
  const { data, error } = await supabase
    .from('candidats_rejetes')
    .select('source_id')
    .eq('aliment_id', alimentId);

  if (error) throw new Error(`Erreur rejetés: ${error.message}`);
  return data.map((l) => l.source_id);
}

async function traiterGroupe(groupe) {
  const conserve = await recupererAliment(groupe.garder);
  if (!conserve) {
    console.log(`  Fiche à conserver introuvable : ${groupe.garder}`);
    return;
  }

  console.log(`\n=== ${conserve.nom} (${conserve.slug}) ===`);

  const etudesConservees = new Set(await etudesDe(conserve.id));
  const rejetesConserves = new Set(await rejetesDe(conserve.id));
  console.log(`  Avant : ${etudesConservees.size} étude(s), ${rejetesConserves.size} candidat(s) rejeté(s).`);

  for (const slugAbsorbe of groupe.absorber) {
    const absorbe = await recupererAliment(slugAbsorbe);
    if (!absorbe) {
      console.log(`  Introuvable, on passe : ${slugAbsorbe}`);
      continue;
    }

    const etudes = await etudesDe(absorbe.id);
    const rejetes = await rejetesDe(absorbe.id);

    const etudesATransferer = etudes.filter((id) => !etudesConservees.has(id));
    const rejetesATransferer = rejetes.filter((id) => !rejetesConserves.has(id));

    console.log(
      `  ${absorbe.slug} : ${etudes.length} étude(s) dont ${etudesATransferer.length} à transférer, ` +
      `${rejetes.length} rejet(s) dont ${rejetesATransferer.length} à transférer.`
    );

    if (!MODE_SIMULATION) {
      if (etudesATransferer.length > 0) {
        const { error } = await supabase.from('aliments_etudes').insert(
          etudesATransferer.map((etude_id) => ({ aliment_id: conserve.id, etude_id }))
        );
        if (error) console.log(`    Erreur transfert études: ${error.message}`);
      }

      if (rejetesATransferer.length > 0) {
        const { error } = await supabase.from('candidats_rejetes').insert(
          rejetesATransferer.map((source_id) => ({ aliment_id: conserve.id, source_id }))
        );
        if (error) console.log(`    Erreur transfert rejets: ${error.message}`);
      }

      const { error: erreurDesactivation } = await supabase
        .from('aliments')
        .update({ actif: false })
        .eq('id', absorbe.id);

      if (erreurDesactivation) {
        console.log(`    Erreur désactivation: ${erreurDesactivation.message}`);
      } else {
        console.log(`    Désactivée.`);
      }
    }

    etudesATransferer.forEach((id) => etudesConservees.add(id));
    rejetesATransferer.forEach((id) => rejetesConserves.add(id));
  }

  console.log(`  Après : ${etudesConservees.size} étude(s), ${rejetesConserves.size} candidat(s) rejeté(s).`);
}

async function main() {
  console.log(
    `${GROUPES.length} groupe(s) à traiter.` +
    (MODE_SIMULATION ? ' MODE SIMULATION : aucune écriture en base.' : ' MODE RÉEL.')
  );

  for (const groupe of GROUPES) {
    try {
      await traiterGroupe(groupe);
    } catch (e) {
      console.log(`Erreur sur le groupe ${groupe.garder}:`, e.message);
    }
  }

  console.log('\nTerminé.');
}

main();
