import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Protection anti-robots (2 oct. 2026) : champ piège + Cloudflare Turnstile,
// et envoi du lien uniquement aux adresses réellement abonnées.
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

export async function POST(request) {
  try {
    const { email, tokenTurnstile, siteWeb } = await request.json();

    // Toujours répondre le même message, que l'email existe ou non parmi les abonnés,
    // pour ne pas révéler si une adresse est déjà abonnée à quelque chose (confidentialité).
    const messageGenerique = 'Si cette adresse est associée à des abonnements, un lien de gestion vient de lui être envoyé.';

    // Champ piège rempli : c'est un robot. Même réponse que d'habitude, sans rien envoyer.
    if (siteWeb) {
      return Response.json({ message: messageGenerique });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const humainVerifie = await verifierTurnstile(tokenTurnstile, ip);
    if (!humainVerifie) {
      return Response.json(
        { erreur: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.' },
        { status: 400 }
      );
    }

    if (!email) {
      return Response.json({ erreur: 'Email requis.' }, { status: 400 });
    }

    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
      return Response.json({ erreur: 'Adresse email invalide.' }, { status: 400 });
    }

    // N'envoyer le lien qu'aux adresses qui ont réellement des abonnements actifs.
    const { count: abonnementsActifs } = await supabase
      .from('abonnements')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .eq('actif', true);

    if (!abonnementsActifs) {
      return Response.json({ message: messageGenerique });
    }

    // Rate-limiting : maximum 3 demandes de lien par heure pour une même adresse,
    // pour empêcher qu'on puisse spammer la boîte mail de quelqu'un d'autre.
    const uneHeureAvant = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: demandesRecentes } = await supabase
      .from('liens_magiques')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .gte('date_creation', uneHeureAvant);

    if (demandesRecentes >= 3) {
      // On répond le message générique habituel, sans révéler que la limite a été atteinte.
      return Response.json({ message: messageGenerique });
    }

    const { data: lienMagique, error: erreurInsert } = await supabase
      .from('liens_magiques')
      .insert({ email })
      .select('token')
      .single();

    if (erreurInsert) {
      console.error('Erreur création lien magique:', erreurInsert.message);
      return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
    }

    const lienGestion = `https://sciencetruths.com/mes-alertes/gerer?token=${lienMagique.token}`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'ScienceTruths', email: 'alertes@sciencetruths.com' },
        to: [{ email }],
        subject: 'Gérer vos alertes ScienceTruths',
        htmlContent: `
          <p>Bonjour,</p>
          <p>Voici votre lien pour gérer vos abonnements aux alertes ScienceTruths :</p>
          <p><a href="${lienGestion}">Gérer mes alertes</a></p>
          <p>Ce lien est valable pendant 1 heure.</p>
          <p style="font-size: 13px; color: #888;">Si vous ne trouvez pas cet email la prochaine fois, pensez à vérifier vos spams / courriers indésirables.</p>
          <p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Erreur envoi email Brevo:', errText);
      // On ne fait pas échouer la requête côté utilisateur pour ne pas révéler
      // d'info technique — le message générique reste affiché.
    }

    return Response.json({ message: messageGenerique });
  } catch (e) {
    console.error('Erreur route lien-magique:', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
