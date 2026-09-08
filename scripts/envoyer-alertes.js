// Script hebdomadaire : envoie un email récapitulatif à chaque personne
// abonnée aux alertes, avec les nouvelles études ajoutées depuis son inscription.
// Gère deux types de sujets : aliments et habitudes alimentaires (régimes).
// Un seul email par personne, même si elle suit plusieurs sujets de types différents.
// À lancer après les scripts d'import (les nouvelles études doivent déjà être en base).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration par type de sujet : quelle table de liaison, quelle table de noms,
// quel préfixe d'URL sur le site.
const CONFIG_PAR_TYPE = {
  aliment: {
    tableLiaison: 'aliments_etudes',
    colonneLiaison: 'aliment_id',
    tableSujets: 'aliments',
    prefixeUrl: 'aliments',
    labelTous: 'Tous les aliments',
  },
  habitude_alimentaire: {
    tableLiaison: 'habitudes_etudes',
    colonneLiaison: 'habitude_id',
    tableSujets: 'habitudes_alimentaires',
    prefixeUrl: 'habitudes',
    labelTous: 'Toutes les habitudes alimentaires',
  },
};

async function recupererEtudesPourAbonnement(abonnement) {
  const config = CONFIG_PAR_TYPE[abonnement.type_sujet];
  if (!config) return [];

  const { data: dejaEnvoyees } = await supabase
    .from('alertes_envoyees')
    .select('etude_id')
    .eq('abonnement_id', abonnement.id);
  const idsDejaEnvoyees = new Set((dejaEnvoyees || []).map((a) => a.etude_id));

  let etudeIds = [];
  let sujetParEtude = {}; // etude_id -> { nom, slug }

  if (abonnement.sujet_id === null) {
    // "Tous les X" : toutes les études liées à n'importe quel sujet de ce type.
    // Pagination explicite car Supabase limite silencieusement à 1000 lignes par défaut.
    let toutesLesLiaisons = [];
    let debut = 0;
    const tailleLot = 1000;
    while (true) {
      const { data: lot } = await supabase
        .from(config.tableLiaison)
        .select(`etude_id, ${config.colonneLiaison}`)
        .range(debut, debut + tailleLot - 1);
      if (!lot || lot.length === 0) break;
      toutesLesLiaisons = toutesLesLiaisons.concat(lot);
      if (lot.length < tailleLot) break;
      debut += tailleLot;
    }
    etudeIds = [...new Set(toutesLesLiaisons.map((l) => l.etude_id))];

    const idsSujetsConcernes = [...new Set(toutesLesLiaisons.map((l) => l[config.colonneLiaison]))];
    let infosParSujet = {};
    for (let i = 0; i < idsSujetsConcernes.length; i += 200) {
      const lotIds = idsSujetsConcernes.slice(i, i + 200);
      const { data: lotSujets } = await supabase.from(config.tableSujets).select('id, nom, slug').in('id', lotIds);
      (lotSujets || []).forEach((s) => {
        infosParSujet[s.id] = { nom: s.nom, slug: s.slug };
      });
    }
    toutesLesLiaisons.forEach((l) => {
      if (!sujetParEtude[l.etude_id]) sujetParEtude[l.etude_id] = infosParSujet[l[config.colonneLiaison]];
    });
  } else {
    const { data: liaisons } = await supabase
      .from(config.tableLiaison)
      .select('etude_id')
      .eq(config.colonneLiaison, abonnement.sujet_id);
    etudeIds = (liaisons || []).map((l) => l.etude_id);
    etudeIds.forEach((id) => {
      sujetParEtude[id] = { nom: abonnement.nomSujet, slug: abonnement.slugSujet };
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
    .map((e) => ({ ...e, sujet: sujetParEtude[e.id] || null, prefixeUrl: config.prefixeUrl }));
}

async function construireEmailPourPersonne(email, abonnementsDeCettePersonne) {
  const pairesAEnregistrer = [];
  const etudesParSujet = {}; // "prefixeUrl/slug" -> { nom, prefixeUrl, count }

  for (const abonnement of abonnementsDeCettePersonne) {
    const etudes = await recupererEtudesPourAbonnement(abonnement);
    if (etudes.length === 0) continue;

    etudes.forEach((e) => pairesAEnregistrer.push({ abonnement_id: abonnement.id, etude_id: e.id }));

    etudes.forEach((e) => {
      if (!e.sujet || !e.sujet.slug) return;
      const cle = `${e.prefixeUrl}/${e.sujet.slug}`;
      if (!etudesParSujet[cle]) {
        etudesParSujet[cle] = { nom: e.sujet.nom, prefixeUrl: e.prefixeUrl, count: 0 };
      }
      etudesParSujet[cle].count++;
    });
  }

  const sujetsAvecNouveautes = Object.entries(etudesParSujet);
  if (sujetsAvecNouveautes.length === 0) return null;

  const listeLiens = sujetsAvecNouveautes
    .map(([cle, info]) => {
      const suffixe = info.count > 1 ? ` (${info.count} nouvelles études)` : '';
      return `<li style="margin-bottom: 8px;"><a href="https://sciencetruths.com/${cle}">${info.nom}${suffixe} →</a></li>`;
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
    .select('id, email, type_sujet, sujet_id, date_confirmation, token_desabonnement')
    .eq('confirme', true)
    .eq('actif', true);

  if (error) throw new Error(`Erreur récupération abonnements: ${error.message}`);
  console.log(`${abonnements.length} abonnements actifs à traiter.`);

  // Récupère noms/slugs des sujets précis, par type
  for (const type of Object.keys(CONFIG_PAR_TYPE)) {
    const config = CONFIG_PAR_TYPE[type];
    const idsConcernes = [...new Set(abonnements.filter((a) => a.type_sujet === type && a.sujet_id).map((a) => a.sujet_id))];
    let infosParId = {};
    if (idsConcernes.length > 0) {
      const { data: sujets } = await supabase.from(config.tableSujets).select('id, nom, slug').in('id', idsConcernes);
      infosParId = Object.fromEntries((sujets || []).map((s) => [s.id, s]));
    }
    abonnements.forEach((a) => {
      if (a.type_sujet === type && a.sujet_id) {
        a.nomSujet = infosParId[a.sujet_id]?.nom || null;
        a.slugSujet = infosParId[a.sujet_id]?.slug || null;
      }
    });
  }

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
