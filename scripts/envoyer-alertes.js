// Script hebdomadaire : envoie un email récapitulatif à chaque personne
// abonnée aux alertes, avec les nouvelles études ajoutées depuis son inscription.
// Un seul email par personne, même si elle suit plusieurs aliments.
// À lancer après le script d'import (les nouvelles études doivent déjà être en base).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function recupererEtudesPourAbonnement(abonnement) {
  const { data: dejaEnvoyees } = await supabase
    .from('alertes_envoyees')
    .select('etude_id')
    .eq('abonnement_id', abonnement.id);
  const idsDejaEnvoyees = new Set((dejaEnvoyees || []).map((a) => a.etude_id));

  let etudeIds = [];
  let alimentParEtude = {}; // etude_id -> { nom, slug }

  if (abonnement.sujet_id === null) {
    // "Tous les aliments" : toutes les études liées à n'importe quel aliment.
    // Pagination explicite car Supabase limite silencieusement à 1000 lignes par défaut,
    // et cette table dépasse largement ce seuil.
    let toutesLesLiaisons = [];
    let debut = 0;
    const tailleLot = 1000;
    while (true) {
      const { data: lot } = await supabase
        .from('aliments_etudes')
        .select('etude_id, aliment_id')
        .range(debut, debut + tailleLot - 1);
      if (!lot || lot.length === 0) break;
      toutesLesLiaisons = toutesLesLiaisons.concat(lot);
      if (lot.length < tailleLot) break;
      debut += tailleLot;
    }
    etudeIds = [...new Set(toutesLesLiaisons.map((l) => l.etude_id))];

    const idsAlimentsConcernes = [...new Set(toutesLesLiaisons.map((l) => l.aliment_id))];
    let infosParAliment = {};
    for (let i = 0; i < idsAlimentsConcernes.length; i += 200) {
      const lotIds = idsAlimentsConcernes.slice(i, i + 200);
      const { data: lotAliments } = await supabase.from('aliments').select('id, nom, slug').in('id', lotIds);
      (lotAliments || []).forEach((a) => {
        infosParAliment[a.id] = { nom: a.nom, slug: a.slug };
      });
    }
    toutesLesLiaisons.forEach((l) => {
      if (!alimentParEtude[l.etude_id]) alimentParEtude[l.etude_id] = infosParAliment[l.aliment_id];
    });
  } else {
    const { data: liaisons } = await supabase
      .from('aliments_etudes')
      .select('etude_id')
      .eq('aliment_id', abonnement.sujet_id);
    etudeIds = (liaisons || []).map((l) => l.etude_id);
    etudeIds.forEach((id) => {
      alimentParEtude[id] = { nom: abonnement.nomAliment, slug: abonnement.slugAliment };
    });
  }

  if (etudeIds.length === 0) return [];

  let etudes = [];
  const tailleLotEtudes = 200;
  for (let i = 0; i < etudeIds.length; i += tailleLotEtudes) {
    const lotIds = etudeIds.slice(i, i + tailleLotEtudes);
    const { data: lotEtudes, error } = await supabase
      .from('etudes')
      .select('id, created_at')
      .in('id', lotIds);

    if (error) {
      console.log(`  Erreur récupération études (lot ${i}): ${error.message}`);
      continue;
    }
    etudes = etudes.concat(lotEtudes || []);
  }

  return etudes
    .filter(
      (e) => new Date(e.created_at) > new Date(abonnement.date_confirmation) && !idsDejaEnvoyees.has(e.id)
    )
    .map((e) => ({ ...e, aliment: alimentParEtude[e.id] || null }));
}

async function construireEmailPourPersonne(email, abonnementsDeCettePersonne) {
  const pairesAEnregistrer = [];
  const etudesParAliment = {}; // slug -> { nom, count, etudeIds: [] }

  for (const abonnement of abonnementsDeCettePersonne) {
    const etudes = await recupererEtudesPourAbonnement(abonnement);
    if (etudes.length === 0) continue;

    etudes.forEach((e) => pairesAEnregistrer.push({ abonnement_id: abonnement.id, etude_id: e.id }));

    etudes.forEach((e) => {
      if (!e.aliment || !e.aliment.slug) return;
      if (!etudesParAliment[e.aliment.slug]) {
        etudesParAliment[e.aliment.slug] = { nom: e.aliment.nom, count: 0 };
      }
      etudesParAliment[e.aliment.slug].count++;
    });
  }

  const alimentsAvecNouveautes = Object.entries(etudesParAliment);
  if (alimentsAvecNouveautes.length === 0) return null;

  const listeLiens = alimentsAvecNouveautes
    .map(([slug, info]) => {
      const suffixe = info.count > 1 ? ` (${info.count} nouvelles études)` : '';
      return `<li style="margin-bottom: 8px;"><a href="https://sciencetruths.com/aliments/${slug}">${info.nom}${suffixe} →</a></li>`;
    })
    .join('');

  return {
    html: `
      <p>Bonjour,</p>
      <p>Voici les nouvelles études ajoutées cette semaine sur les sujets que vous suivez :</p>
      <ul>${listeLiens}</ul>
      <p style="font-size: 12px; color: #888; margin-top: 24px;">
        <a href="https://sciencetruths.com/mes-alertes">Gérer mes alertes</a>
      </p>
    `,
    pairesAEnregistrer,
  };
}

async function envoyerEmail(email, contenuHtml) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'ScienceTruths', email: 'alertes@sciencetruths.com' },
      to: [{ email }],
      subject: 'Vos nouvelles études ScienceTruths cette semaine',
      htmlContent: contenuHtml,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur envoi Brevo pour ${email}: ${errText}`);
  }
}

async function main() {
  console.log('=== Envoi des alertes hebdomadaires ===');

  const { data: abonnements, error } = await supabase
    .from('abonnements')
    .select('id, email, sujet_id, date_confirmation, token_desabonnement')
    .eq('type_sujet', 'aliment')
    .eq('confirme', true)
    .eq('actif', true);

  if (error) throw new Error(`Erreur récupération abonnements: ${error.message}`);
  console.log(`${abonnements.length} abonnements actifs à traiter.`);

  const idsAliments = [...new Set(abonnements.filter((a) => a.sujet_id).map((a) => a.sujet_id))];
  let nomsParId = {};
  let slugsParId = {};
  if (idsAliments.length > 0) {
    const { data: aliments } = await supabase.from('aliments').select('id, nom, slug').in('id', idsAliments);
    nomsParId = Object.fromEntries((aliments || []).map((a) => [a.id, a.nom]));
    slugsParId = Object.fromEntries((aliments || []).map((a) => [a.id, a.slug]));
  }
  abonnements.forEach((a) => {
    a.nomAliment = a.sujet_id ? nomsParId[a.sujet_id] : null;
    a.slugAliment = a.sujet_id ? slugsParId[a.sujet_id] : null;
  });

  const parEmail = {};
  for (const a of abonnements) {
    if (!parEmail[a.email]) parEmail[a.email] = [];
    parEmail[a.email].push(a);
  }

  let emailsEnvoyes = 0;

  for (const [email, abonnementsDeCettePersonne] of Object.entries(parEmail)) {
    try {
      const resultat = await construireEmailPourPersonne(email, abonnementsDeCettePersonne);
      if (!resultat) {
        console.log(`  - ${email} : rien de nouveau, pas d'email.`);
        continue;
      }

      await envoyerEmail(email, resultat.html);

      for (const paire of resultat.pairesAEnregistrer) {
        await supabase.from('alertes_envoyees').upsert(paire, { onConflict: 'abonnement_id,etude_id' });
      }

      emailsEnvoyes++;
      console.log(`  - ${email} : email envoyé.`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (e) {
      console.log(`  - Erreur pour ${email}: ${e.message}`);
    }
  }

  console.log(`\nTerminé. ${emailsEnvoyes} emails envoyés.`);
}

main();
