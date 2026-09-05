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
  // Récupère les IDs d'études déjà envoyées pour cet abonnement précis
  const { data: dejaEnvoyees } = await supabase
    .from('alertes_envoyees')
    .select('etude_id')
    .eq('abonnement_id', abonnement.id);
  const idsDejaEnvoyees = new Set((dejaEnvoyees || []).map((a) => a.etude_id));

  let etudeIds = [];

  if (abonnement.sujet_id === null) {
    // "Tous les aliments" : toutes les études liées à n'importe quel aliment
    const { data: liaisons } = await supabase
      .from('aliments_etudes')
      .select('etude_id');
    etudeIds = [...new Set((liaisons || []).map((l) => l.etude_id))];
  } else {
    // Un aliment précis
    const { data: liaisons } = await supabase
      .from('aliments_etudes')
      .select('etude_id')
      .eq('aliment_id', abonnement.sujet_id);
    etudeIds = (liaisons || []).map((l) => l.etude_id);
  }

  if (etudeIds.length === 0) return [];

  const { data: etudes } = await supabase
    .from('etudes')
    .select('id, titre_traduit, titre_original, resume_simplifie, url_originale, created_at')
    .in('id', etudeIds);

  // Ne garde que les études : ajoutées après la confirmation de l'abonnement, et jamais encore envoyées pour cet abonnement
  return (etudes || []).filter(
    (e) => new Date(e.created_at) > new Date(abonnement.date_confirmation) && !idsDejaEnvoyees.has(e.id)
  );
}

async function construireEmailPourPersonne(email, abonnementsDeCettePersonne) {
  const sections = [];
  const pairesAEnregistrer = []; // { abonnement_id, etude_id } à noter après envoi réussi
  const etudesDejaIncluses = new Set(); // évite d'afficher deux fois la même étude dans l'email

  for (const abonnement of abonnementsDeCettePersonne) {
    const etudes = await recupererEtudesPourAbonnement(abonnement);
    if (etudes.length === 0) continue;

    const nomSujet = abonnement.sujet_id === null ? 'Tous les aliments' : abonnement.nomAliment;
    const lienDesabonnement = `https://sciencetruths.com/api/abonnements/desabonner?token=${abonnement.token_desabonnement}`;

    const etudesNouvellesPourCetteSection = etudes.filter((e) => !etudesDejaIncluses.has(e.id));
    etudesNouvellesPourCetteSection.forEach((e) => etudesDejaIncluses.add(e.id));

    // On enregistre TOUTES les études trouvées pour cet abonnement (même si déjà affichées
    // via un autre abonnement de la même personne), pour que ce même abonnement ne les
    // reproduise pas la semaine prochaine.
    etudes.forEach((e) => pairesAEnregistrer.push({ abonnement_id: abonnement.id, etude_id: e.id }));

    if (etudesNouvellesPourCetteSection.length === 0) continue;

    const listeEtudes = etudesNouvellesPourCetteSection
      .map(
        (e) => `
          <li style="margin-bottom: 12px;">
            <strong>${e.titre_traduit || e.titre_original}</strong><br/>
            ${e.resume_simplifie ? e.resume_simplifie.slice(0, 200) + '...' : ''}<br/>
            <a href="${e.url_originale}">Voir l'étude →</a>
          </li>
        `
      )
      .join('');

    sections.push(`
      <h2>${nomSujet}</h2>
      <ul>${listeEtudes}</ul>
      <p style="font-size: 13px;"><a href="${lienDesabonnement}">Ne plus suivre ${nomSujet === 'Tous les aliments' ? 'tous les aliments' : nomSujet}</a></p>
      <hr/>
    `);
  }

  if (sections.length === 0) return null;

  return {
    html: `
      <p>Bonjour,</p>
      <p>Voici les nouvelles études scientifiques ajoutées cette semaine sur les sujets que vous suivez :</p>
      ${sections.join('')}
      <p style="font-size: 12px; color: #888;">
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

  // Récupère les noms des aliments concernés (pour l'affichage dans l'email)
  const idsAliments = [...new Set(abonnements.filter((a) => a.sujet_id).map((a) => a.sujet_id))];
  let nomsParId = {};
  if (idsAliments.length > 0) {
    const { data: aliments } = await supabase.from('aliments').select('id, nom').in('id', idsAliments);
    nomsParId = Object.fromEntries((aliments || []).map((a) => [a.id, a.nom]));
  }
  abonnements.forEach((a) => {
    a.nomAliment = a.sujet_id ? nomsParId[a.sujet_id] : null;
  });

  // Regroupe les abonnements par email
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

      // On note ce qui a été envoyé seulement après le succès de l'envoi
      for (const paire of resultat.pairesAEnregistrer) {
        await supabase.from('alertes_envoyees').upsert(paire, { onConflict: 'abonnement_id,etude_id' });
      }

      emailsEnvoyes++;
      console.log(`  - ${email} : email envoyé.`);
      await new Promise((resolve) => setTimeout(resolve, 300)); // pause pour ne pas saturer Brevo
    } catch (e) {
      console.log(`  - Erreur pour ${email}: ${e.message}`);
    }
  }

  console.log(`\nTerminé. ${emailsEnvoyes} emails envoyés.`);
}

main();
