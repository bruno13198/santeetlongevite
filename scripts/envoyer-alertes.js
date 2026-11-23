// Script hebdomadaire : envoie un email récapitulatif à chaque personne
// abonnée aux alertes, avec les nouvelles études ajoutées depuis son inscription.
// Types de sujets : aliments, additifs et contaminants (« substance »), habitudes alimentaires,
// nutriments, problèmes de santé (22 oct. 2026 pour les deux derniers ajouts).
// Un seul email par personne, même si elle suit plusieurs sujets de types différents.
// À lancer après les scripts d'import et le classement par problème de santé.
//
// 23 nov. 2026 : lecture de la base en une seule fois pour tous les abonnés. Avant, chaque
// abonnement « Tous les X » relisait toutes les liaisons et toutes les études de la base
// (environ 1 min 30 par abonné). Désormais, le script charge seulement les études susceptibles
// d'être envoyées (ajoutées après la plus ancienne confirmation et publiées depuis moins de
// 90 jours), puis leurs liaisons, leurs sujets et les envois déjà faits, et trie en mémoire.
// Les règles d'envoi sont inchangées. Les envois sont enregistrés par paquets.
// Mode SIMULATION=true : prépare les emails et affiche le bilan, sans rien envoyer ni enregistrer.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SIMULATION = process.env.SIMULATION === 'true';

// 2 nov. 2026 : seules les études publiées depuis moins de 90 jours sont envoyées.
// Les études anciennes ajoutées par un rattrapage restent visibles sur les fiches,
// mais ne sont jamais présentées comme des nouveautés. Une étude sans date de
// publication (cas très rare) est envoyée comme avant.
const JOURS_NOUVEAUTE = 90;

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

// Tables de sujets qui ont une colonne categorie (nécessaire au filtre additifs / contaminants).
const TABLES_AVEC_CATEGORIE = ['aliments'];

function sujetPasseLeFiltre(config, sujet) {
  if (!config.filtreCategorie) return true;
  if (!sujet) return false;
  const estSubstance = CATEGORIES_SUBSTANCES.includes(sujet.categorie);
  return config.filtreCategorie === 'substances' ? estSubstance : !estSubstance;
}

// ---------------------------------------------------------------------------
// Lecture de la base
// ---------------------------------------------------------------------------

// Lit toutes les lignes d'une requête, par pages de 1000 (limite par défaut de Supabase).
// construire() doit renvoyer une requête triée, pour que les pages ne se chevauchent pas.
// Une erreur de lecture arrête le script : mieux vaut aucun email qu'un email faux.
async function lireToutesLesLignes(construire, libelle) {
  const TAILLE = 1000;
  const lignes = [];
  for (let debut = 0; ; debut += TAILLE) {
    const { data, error } = await construire().range(debut, debut + TAILLE - 1);
    if (error) throw new Error(`Lecture impossible (${libelle}) : ${error.message}`);
    lignes.push(...(data || []));
    if (!data || data.length < TAILLE) break;
  }
  return lignes;
}

// Même chose pour une liste d'identifiants découpée en paquets (filtre .in()).
async function lireParPaquets(ids, taillePaquet, construire, libelle) {
  const lignes = [];
  for (let i = 0; i < ids.length; i += taillePaquet) {
    const paquet = ids.slice(i, i + taillePaquet);
    lignes.push(...(await lireToutesLesLignes(() => construire(paquet), libelle)));
  }
  return lignes;
}

// Charge en une fois tout ce qu'il faut pour préparer les emails de tous les abonnés.
async function chargerDonnees(abonnements) {
  // 1. Études susceptibles d'être envoyées : ajoutées après la plus ancienne confirmation
  //    et publiées depuis moins de 90 jours (ou sans date de publication).
  const plusAncienneConfirmation = abonnements
    .map((a) => a.date_confirmation)
    .filter(Boolean)
    .sort()[0] || '1970-01-01';
  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() - JOURS_NOUVEAUTE);
  const dateLimiteTexte = dateLimite.toISOString().slice(0, 10);

  const etudes = await lireToutesLesLignes(
    () =>
      supabase
        .from('etudes')
        .select('id, created_at, date_publication, titre_traduit, titre_original')
        .gt('created_at', plusAncienneConfirmation)
        .or(`date_publication.is.null,date_publication.gte.${dateLimiteTexte}`)
        .order('id'),
    'études récentes'
  );
  const idsEtudes = etudes.map((e) => e.id);

  // 2. Liaisons de ces études, pour chaque table de liaison utilisée.
  const liaisonsParTable = {};
  for (const config of Object.values(CONFIG_PAR_TYPE)) {
    if (liaisonsParTable[config.tableLiaison]) continue;
    liaisonsParTable[config.tableLiaison] = idsEtudes.length
      ? await lireParPaquets(
          idsEtudes,
          100,
          (paquet) =>
            supabase
              .from(config.tableLiaison)
              .select(`etude_id, ${config.colonneLiaison}`)
              .in('etude_id', paquet)
              .order('etude_id')
              .order(config.colonneLiaison),
          config.tableLiaison
        )
      : [];
  }

  // 3. Noms, slugs (et catégories pour les aliments) des sujets concernés :
  //    ceux de ces liaisons et ceux suivis précisément par un abonné.
  const sujetsParTable = {};
  for (const config of Object.values(CONFIG_PAR_TYPE)) {
    const table = config.tableSujets;
    if (!sujetsParTable[table]) sujetsParTable[table] = new Map();
    const ids = new Set(liaisonsParTable[config.tableLiaison].map((l) => l[config.colonneLiaison]));
    abonnements
      .filter((a) => CONFIG_PAR_TYPE[a.type_sujet]?.tableSujets === table && a.sujet_id)
      .forEach((a) => ids.add(a.sujet_id));
    const aLire = [...ids].filter((id) => !sujetsParTable[table].has(id));
    if (aLire.length === 0) continue;
    const colonnes = TABLES_AVEC_CATEGORIE.includes(table) ? 'id, nom, slug, categorie' : 'id, nom, slug';
    const sujets = await lireParPaquets(
      aLire,
      200,
      (paquet) => supabase.from(table).select(colonnes).in('id', paquet).order('id'),
      table
    );
    sujets.forEach((s) => sujetsParTable[table].set(s.id, { nom: s.nom, slug: s.slug, categorie: s.categorie }));
  }

  // 4. Envois déjà faits pour ces études (abonnement + étude).
  const idsAbonnements = abonnements.map((a) => a.id);
  const envois = idsEtudes.length
    ? await lireParPaquets(
        idsEtudes,
        50,
        (paquet) =>
          supabase
            .from('alertes_envoyees')
            .select('abonnement_id, etude_id')
            .in('etude_id', paquet)
            .in('abonnement_id', idsAbonnements)
            .order('abonnement_id')
            .order('etude_id'),
        'alertes_envoyees'
      )
    : [];
  const dejaEnvoyees = new Set(envois.map((e) => `${e.abonnement_id}|${e.etude_id}`));

  console.log(
    `Données chargées : ${etudes.length} étude(s) récente(s), ${envois.length} envoi(s) déjà fait(s) pour ces études.`
  );
  return { etudes, liaisonsParTable, sujetsParTable, dejaEnvoyees, dateLimite };
}

// ---------------------------------------------------------------------------
// Préparation des emails (mêmes règles qu'avant, à partir des données chargées)
// ---------------------------------------------------------------------------

function recupererEtudesPourAbonnement(abonnement, donnees) {
  const config = CONFIG_PAR_TYPE[abonnement.type_sujet];
  if (!config) return [];

  const liaisons = donnees.liaisonsParTable[config.tableLiaison];
  const sujets = donnees.sujetsParTable[config.tableSujets];
  const sujetParEtude = {}; // etude_id -> { nom, slug }

  if (abonnement.sujet_id === null) {
    // "Tous les X" : toutes les études liées à n'importe quel sujet de ce type
    // (aliments sans les additifs et contaminants, ou l'inverse, selon le type d'abonnement).
    for (const l of liaisons) {
      const sujet = sujets.get(l[config.colonneLiaison]);
      if (!sujetPasseLeFiltre(config, sujet)) continue;
      if (!(l.etude_id in sujetParEtude)) sujetParEtude[l.etude_id] = sujet || null;
    }
  } else {
    const sujet = sujets.get(abonnement.sujet_id) || null;
    for (const l of liaisons) {
      if (l[config.colonneLiaison] === abonnement.sujet_id) sujetParEtude[l.etude_id] = sujet;
    }
  }

  const estRecente = (e) => !e.date_publication || new Date(e.date_publication) >= donnees.dateLimite;

  return donnees.etudes
    .filter(
      (e) =>
        e.id in sujetParEtude &&
        new Date(e.created_at) > new Date(abonnement.date_confirmation) &&
        !donnees.dejaEnvoyees.has(`${abonnement.id}|${e.id}`) &&
        estRecente(e)
    )
    .map((e) => ({ ...e, sujet: sujetParEtude[e.id], prefixeUrl: config.prefixeUrl }));
}

function construireEmailPourPersonne(abonnementsDeCettePersonne, donnees) {
  const pairesAEnregistrer = [];
  const etudesParSujet = {}; // "prefixeUrl/slug" -> { nom, prefixeUrl, titres, doublons }
  const dejaComptees = new Set(); // "prefixeUrl/slug|etude_id" : une étude n'apparaît qu'une fois par sujet
  // 22 oct. 2026 : chaque étude n'est détaillée qu'une fois par e-mail. Les fiches passent d'abord,
  // les problèmes de santé ensuite ; une étude déjà citée est seulement comptée (« déjà présentée plus haut »).
  const etudesDejaDetaillees = new Set();
  const ordreTypes = (t) => (t === 'probleme' ? 1 : 0);
  const abonnementsTries = [...abonnementsDeCettePersonne].sort((a, b) => ordreTypes(a.type_sujet) - ordreTypes(b.type_sujet));

  for (const abonnement of abonnementsTries) {
    const etudes = recupererEtudesPourAbonnement(abonnement, donnees);
    if (etudes.length === 0) continue;

    etudes.forEach((e) => pairesAEnregistrer.push({ abonnement_id: abonnement.id, etude_id: e.id }));

    etudes.forEach((e) => {
      if (!e.sujet || !e.sujet.slug) return;
      const cle = `${e.prefixeUrl}/${e.sujet.slug}`;
      if (dejaComptees.has(`${cle}|${e.id}`)) return;
      dejaComptees.add(`${cle}|${e.id}`);
      if (!etudesParSujet[cle]) {
        etudesParSujet[cle] = { nom: e.sujet.nom, prefixeUrl: e.prefixeUrl, titres: [], doublons: 0 };
      }
      if (etudesDejaDetaillees.has(e.id)) {
        etudesParSujet[cle].doublons++;
      } else {
        etudesDejaDetaillees.add(e.id);
        etudesParSujet[cle].titres.push(e.titre_traduit || e.titre_original);
      }
    });
  }

  const sujetsAvecNouveautes = Object.entries(etudesParSujet);
  if (sujetsAvecNouveautes.length === 0) return null;

  const MAX_TITRES_AFFICHES = 3;
  const listeLiens = sujetsAvecNouveautes
    .map(([cle, info]) => {
      const count = info.titres.length + info.doublons;
      const precisionDoublons = info.doublons > 0
        ? `, dont ${info.doublons} déjà présentée${info.doublons > 1 ? 's' : ''} plus haut`
        : '';
      const suffixe = count > 1
        ? ` (${count} nouvelles études${precisionDoublons})`
        : info.doublons > 0 ? ' (étude déjà présentée plus haut)' : '';
      const titresAffiches = info.titres.slice(0, MAX_TITRES_AFFICHES);
      const titresHtml = titresAffiches
        .map((t) => `<li style="font-size: 13px; color: #555; margin-bottom: 4px;">${t}</li>`)
        .join('');
      const resteHtml = info.titres.length > MAX_TITRES_AFFICHES
        ? `<li style="font-size: 13px; color: #888;">et ${info.titres.length - MAX_TITRES_AFFICHES} autre(s)...</li>`
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
    nbSujets: sujetsAvecNouveautes.length,
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

// Enregistre les envois par paquets de 500 (au lieu d'un appel par étude).
async function enregistrerEnvois(paires) {
  for (let i = 0; i < paires.length; i += 500) {
    const { error } = await supabase
      .from('alertes_envoyees')
      .upsert(paires.slice(i, i + 500), { onConflict: 'abonnement_id,etude_id' });
    if (error) throw new Error(`Enregistrement des envois impossible : ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main() {
  const debut = Date.now();
  console.log(`=== Envoi des alertes hebdomadaires${SIMULATION ? ' (SIMULATION : rien ne sera envoyé ni enregistré)' : ''} ===`);

  const { data: abonnements, error } = await supabase
    .from('abonnements')
    .select('id, email, type_sujet, sujet_id, date_confirmation, token_desabonnement')
    .eq('confirme', true)
    .eq('actif', true);

  if (error) throw new Error(`Erreur récupération abonnements: ${error.message}`);
  console.log(`${abonnements.length} abonnements actifs à traiter.`);
  if (abonnements.length === 0) return;

  const donnees = await chargerDonnees(abonnements);

  const parEmail = {};
  for (const a of abonnements) {
    if (!parEmail[a.email]) parEmail[a.email] = [];
    parEmail[a.email].push(a);
  }

  let emailsEnvoyes = 0;

  for (const [email, abonnementsDeCettePersonne] of Object.entries(parEmail)) {
    try {
      const resultat = construireEmailPourPersonne(abonnementsDeCettePersonne, donnees);
      if (!resultat) {
        console.log(`  - ${email} : rien de nouveau, pas d'email.`);
        continue;
      }

      if (SIMULATION) {
        console.log(`  - ${email} : email prêt (${resultat.nbSujets} sujet(s), ${resultat.pairesAEnregistrer.length} étude(s)), non envoyé.`);
        continue;
      }

      await envoyerEmail(email, resultat.html);
      emailsEnvoyes++;

      try {
        await enregistrerEnvois(resultat.pairesAEnregistrer);
      } catch (e) {
        // L'email est parti : on le signale clairement, car ces études seraient renvoyées la semaine prochaine.
        console.log(`  ⚠️ ${email} : email envoyé, mais ${e.message}`);
      }

      console.log(`  - ${email} : email envoyé.`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (e) {
      console.log(`  - Erreur pour ${email}: ${e.message}`);
    }
  }

  const duree = Math.round((Date.now() - debut) / 1000);
  console.log(`\nTerminé. ${emailsEnvoyes} emails envoyés, en ${duree} s.`);
}

main().catch((e) => {
  console.error('Erreur fatale :', e.message);
  process.exit(1);
});
