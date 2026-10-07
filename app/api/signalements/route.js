import { createClient } from '@supabase/supabase-js';

// Signalement d'une erreur sur une étude (5 oct. 2026).
// Protection anti-robots identique aux alertes : champ piège + Cloudflare Turnstile,
// vérifiés AVANT toute écriture en base. Les signalements sont enregistrés dans la table
// signalements_etudes ; si la variable EMAIL_NOTIFICATION_SIGNALEMENTS est définie dans
// Vercel, une copie est aussi envoyée par e-mail (Brevo).

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TYPES_AUTORISES = {
  resume: 'Résumé inexact ou incomplet',
  niveau: 'Niveau de preuve contestable',
  hors_sujet: 'Étude hors sujet pour cette fiche',
  autre: 'Autre',
};

async function verifierTurnstile(token, ip) {
  if (!token || !process.env.TURNSTILE_SECRET_KEY) return false;
  try {
    const parametres = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) parametres.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parametres,
    });
    const resultat = await res.json();
    return resultat.success === true;
  } catch (e) {
    console.error('Erreur vérification Turnstile:', e.message);
    return false;
  }
}

function texte(valeur, longueurMax) {
  return typeof valeur === 'string' ? valeur.trim().slice(0, longueurMax) : '';
}

function echapperHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(request) {
  try {
    const corps = await request.json();

    // Champ piège rempli : c'est un robot. On répond comme si tout allait bien, sans rien faire.
    if (corps.siteWeb) {
      return Response.json({ message: 'Merci, votre signalement a bien été transmis.' });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    if (!(await verifierTurnstile(corps.tokenTurnstile, ip))) {
      return Response.json(
        { erreur: 'La vérification anti-robot a échoué. Réessayez.' },
        { status: 400 }
      );
    }

    const etudeId = texte(corps.etudeId, 64);
    const type = texte(corps.type, 20);
    const message = texte(corps.message, 3000);
    const nom = texte(corps.nom, 120);
    const profession = texte(corps.profession, 120);
    const email = texte(corps.email, 200);
    const page = texte(corps.page, 300);

    if (!/^[0-9a-f-]{36}$/i.test(etudeId)) {
      return Response.json({ erreur: 'Étude inconnue.' }, { status: 400 });
    }
    if (!TYPES_AUTORISES[type]) {
      return Response.json({ erreur: 'Choisissez le type de problème.' }, { status: 400 });
    }
    if (message.length < 10) {
      return Response.json({ erreur: 'Décrivez le problème en quelques mots (10 caractères minimum).' }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ erreur: 'Adresse e-mail invalide.' }, { status: 400 });
    }

    const { data: etude } = await supabase
      .from('etudes')
      .select('id, titre_original')
      .eq('id', etudeId)
      .maybeSingle();

    if (!etude) {
      return Response.json({ erreur: 'Étude inconnue.' }, { status: 400 });
    }

    const { error } = await supabase.from('signalements_etudes').insert({
      etude_id: etudeId,
      type,
      message,
      nom: nom || null,
      profession: profession || null,
      email: email || null,
      page: page || null,
    });

    if (error) {
      console.error('Erreur insertion signalement:', error.message);
      return Response.json({ erreur: "Le signalement n'a pas pu être enregistré. Réessayez plus tard." }, { status: 500 });
    }

    // Copie par e-mail, seulement si l'adresse de notification est configurée.
    const destinataire = process.env.EMAIL_NOTIFICATION_SIGNALEMENTS;
    if (destinataire && process.env.BREVO_API_KEY) {
      try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
          body: JSON.stringify({
            sender: { name: 'ScienceTruths', email: 'alertes@sciencetruths.com' },
            to: [{ email: destinataire }],
            subject: `Signalement : ${TYPES_AUTORISES[type]}`,
            htmlContent: `
              <p><strong>${echapperHtml(TYPES_AUTORISES[type])}</strong></p>
              <p>Étude : ${echapperHtml(etude.titre_original || etudeId)}</p>
              <p>Page : ${echapperHtml(page || '—')}</p>
              <p>Message :<br>${echapperHtml(message).replace(/\n/g, '<br>')}</p>
              <p>De : ${echapperHtml(nom || 'anonyme')}${profession ? ` (${echapperHtml(profession)})` : ''}${email ? ` — ${echapperHtml(email)}` : ''}</p>
            `,
          }),
        });
      } catch (e) {
        console.error('Erreur e-mail de notification:', e.message); // le signalement est déjà enregistré
      }
    }

    return Response.json({ message: 'Merci, votre signalement a bien été transmis. Il sera examiné.' });
  } catch (e) {
    console.error('Erreur route signalements:', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
