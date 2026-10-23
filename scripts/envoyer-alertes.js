// Script hebdomadaire : envoie un email récapitulatif à chaque personne
// abonnée aux alertes, avec les nouvelles études ajoutées depuis son inscription.
// Types de sujets : aliments, additifs et contaminants (« substance »), habitudes alimentaires,
// nutriments, problèmes de santé (22 oct. 2026 pour les deux derniers ajouts).
// Un seul email par personne, même si elle suit plusieurs sujets de types différents.
// À lancer après les scripts d'import et le classement par problème de santé.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Catégories de la table aliments qui forment l'onglet « Additifs et contaminants ».
const CATEGORIES_SUBSTANCES = ['Additifs alimentaires', 'Contaminants alimentaires'];

// Configuration par type de sujet : quelle table de liaison, quelle table de noms,
// quel préfixe d'URL sur le site. filtreCategorie (abonnements « Tous » seulement) :
// 'sans_substances' = aliments hors additifs et contaminants ; 'substances' = l'inverse.
const CONFIG_PAR_TYPE = {
  aliment: {
    tableLiaison: 'aliments_etudes',
    colonneLiaison: 'aliment_id',
    tableSujets: 'aliments',
    prefixeUrl: 'aliments',
    labelTous: 'Tous les aliments',
    filtreCategorie: 'sans_substances',
  },
  substance: {
    tableLiaison: 'aliments_etudes',
    colonneLiaison: 'aliment_id',
    tableSujets: 'aliments',
    prefixeUrl: 'aliments',
    labelTous: 'Tous les additifs et contaminants',
    filtreCategorie: 'substances',
  },
  habitude_alimentaire: {
    tableLiaison: 'habitudes_etudes',
    colonneLiaison: 'habitude_id',
    tableSujets: 'habitudes_alimentaires',
    prefixeUrl: 'habitudes',
    labelTous: 'Toutes les habitudes alimentaires',
  },
  nutriment: {
    tableLiaison: 'nutriments_etudes',
    colonneLiaison: 'nutriment_id',
    tableSujets: 'nutriments',
    prefixeUrl: 'nutriments',
    labelTous: 'Tous les nutriments et compléments',
  },
  probleme: {
    tableLiaison: 'etudes_problemes',
    colonneLiaison: 'probleme_id',
    tableSujets: 'problemes_sante',
    prefixeUrl: 'sante',
    labelTous: 'Tous les problèmes de santé',
  },
};

function sujetPasseLeFiltre(config, sujet) {
  if (!config.filtreCategorie) return true;
  if (!sujet) return false;
  const estSubstance = CATEGORIES_SUBSTANCES.includes(sujet.categorie);
  return config.filtreCategorie === 'substances' ? estSubstance : !estSubstance;
}

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

    const idsSujetsConcernes = [...new Set(toutesLesLiaisons.map((l) => l[config.colonneLiaison]))];
    const colonnes = config.filtreCategorie ? 'id, nom, slug, categorie' : 'id, nom, slug';
    let infosParSujet = {};
    for (let i = 0; i < idsSujetsConcernes.length; i += 200) {
      const lotIds = idsSujetsConcernes.slice(i, i + 200);
      const { data: lotSujets } = await supabase.from(config.tableSujets).select(colonnes).in('id', lotIds);
      (lotSujets || []).forEach((s) => {
        infosParSujet[s.id] = { nom: s.nom, slug: s.slug, categorie: s.categorie };
      });
    }

    // Aliments sans les additifs et contaminants, ou l'inverse (selon le type d'abonnement)
    const liaisonsRetenues = toutesLesLiaisons.filter((l) =>
      sujetPasseLeFiltre(config, infosParSujet[l[config.colonneLiaison]])
    );
    etudeIds = [...new Set(liaisonsRetenues.map((l) => l.etude_id))];
    liaisonsRetenues.forEach((l) => {
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
      .select('id, created_at, titre_traduit, titre_original')
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
  const etudesParSujet = {}; // "prefixeUrl/slug" -> { nom, prefixeUrl, titres }
  const dejaComptees = new Set(); // "prefixeUrl/slug|etude_id" : une étude n'apparaît qu'une fois par sujet

  for (const abonnement of abonnementsDeCettePersonne) {
    const etudes = await recupererEtudesPourAbonnement(abonnement);
    if (etudes.length === 0) continue;

    etudes.forEach((e) => pairesAEnregistrer.push({ abonnement_id: abonnement.id, etude_id: e.id }));

    etudes.forEach((e) => {
      if (!e.sujet || !e.sujet.slug) return;
      const cle = `${e.prefixeUrl}/${e.sujet.slug}`;
      if (dejaComptees.has(`${cle}|${e.id}`)) return;
      dejaComptees.add(`${cle}|${e.id}`);
      if (!etudesParSujet[cle]) {
        etudesParSujet[cle] = { nom: e.sujet.nom, prefixeUrl: e.prefixeUrl, titres: [] };
      }
      etudesParSujet[cle].titres.push(e.titre_traduit || e.titre_original);
    });
  }

  const sujetsAvecNouveautes = Object.entries(etudesParSujet);
  if (sujetsAvecNouveautes.length === 0) return null;

  const MAX_TITRES_AFFICHES = 3;
  const listeLiens = sujetsAvecNouveautes
    .map(([cle, info]) => {
      const count = info.titres.length;
      const suffixe = count > 1 ? ` (${count} nouvelles études)` : '';
      const titresAffiches = info.titres.slice(0, MAX_TITRES_AFFICHES);
      const titresHtml = titresAffiches
        .map((t) => `<li style="font-size: 13px; color: #555; margin-bottom: 4px;">${t}</li>`)
        .join('');
      const resteHtml = count > MAX_TITRES_AFFICHES
        ? `<li style="font-size: 13px; color: #888;">et ${count - MAX_TITRES_AFFICHES} autre(s)...</li>`
        : '';
      return `
        <li style="margin-bottom: 16px;">
          <a href="https://sciencetruths.com/${cle}" style="font-weight: bold;">${info.nom}${suffixe} →</a>
          <ul style="margin-top: 4px; padding-left: 20px;">${titresHtml}${resteHtml}</ul>
        </li>
      `;
    })
    .join('');

  return {
    html: `
      <p>Bonjour,</p>
      <p>Voici les nouvelles études ajoutées cette semaine sur les sujets que vous suivez :</p>
      <ul>${listeLiens}</ul>
      <p style="font-size: 12px; color: #888; margin-top: 24px;">
        <a href="https://sciencetruths.com/veille-scientifique#gerer-alertes">Gérer mes alertes</a>
        &nbsp;·&nbsp;
        <a href="https://sciencetruths.com/se-desabonner?token=${abonnementsDeCettePersonne[0].token_desabonnement}">Se désabonner de toutes les alertes</a>
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
