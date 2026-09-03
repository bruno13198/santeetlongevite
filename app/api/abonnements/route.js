import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, alimentIds, tousLesAliments } = await request.json();

    if (!email) {
      return Response.json({ erreur: 'Email requis.' }, { status: 400 });
    }

    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
      return Response.json({ erreur: 'Adresse email invalide.' }, { status: 400 });
    }

    const listeAliments = Array.isArray(alimentIds) ? alimentIds : [];

    if (!tousLesAliments && listeAliments.length === 0) {
      return Response.json({ erreur: 'Sélectionnez au moins un aliment, ou "Tous les aliments".' }, { status: 400 });
    }

    // Construit la liste des lignes à insérer : soit une seule ligne "tous",
    // soit une ligne par aliment sélectionné.
    const lignesAInserer = tousLesAliments
      ? [{ email, type_sujet: 'aliment', sujet_id: null }]
      : listeAliments.map((id) => ({ email, type_sujet: 'aliment', sujet_id: id }));

    let nombreCrees = 0;
    let premierToken = null;

    for (const ligne of lignesAInserer) {
      // upsert : si l'abonnement existe déjà (même email + même sujet), on ne duplique pas.
      const { data, error } = await supabase
        .from('abonnements')
        .upsert(ligne, {
          onConflict: ligne.sujet_id === null ? 'email,type_sujet' : 'email,type_sujet,sujet_id',
          ignoreDuplicates: false,
        })
        .select('id, token_confirmation, confirme')
        .single();

      if (error) {
        console.error('Erreur insertion abonnement:', error.message);
        continue;
      }

      if (!data.confirme) {
        nombreCrees++;
        if (!premierToken) premierToken = data.token_confirmation;
      }
    }

    if (nombreCrees === 0) {
      return Response.json({ message: 'Ces abonnements sont déjà actifs et confirmés pour cet email.' });
    }

    // Un seul email de confirmation, qui valide TOUS les abonnements non confirmés de cet email d'un coup.
    const lienConfirmation = `https://sciencetruths.com/api/abonnements/confirmer-tout?email=${encodeURIComponent(email)}&token=${premierToken}`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'ScienceTruths', email: 'alertes@sciencetruths.com' },
        to: [{ email }],
        subject: 'Confirmez vos alertes ScienceTruths',
        htmlContent: `
          <p>Bonjour,</p>
          <p>Vous avez demandé à recevoir des alertes par email sur ScienceTruths.</p>
          <p>Pour confirmer votre inscription, cliquez sur ce lien :</p>
          <p><a href="${lienConfirmation}">Confirmer mes alertes</a></p>
          <p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Erreur envoi email Brevo:', errText);
      return Response.json({ erreur: 'Erreur lors de l\'envoi de l\'email.' }, { status: 500 });
    }

    return Response.json({ message: 'Vérifiez votre boîte mail pour confirmer vos alertes.' });
  } catch (e) {
    console.error('Erreur route abonnements:', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
