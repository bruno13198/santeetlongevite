import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, alimentIds, tousLesAliments, habitudeIds, toutesLesHabitudes } = await request.json();

    if (!email) {
      return Response.json({ erreur: 'Email requis.' }, { status: 400 });
    }

    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
      return Response.json({ erreur: 'Adresse email invalide.' }, { status: 400 });
    }

    const listeAliments = Array.isArray(alimentIds) ? alimentIds : [];
    const listeHabitudes = Array.isArray(habitudeIds) ? habitudeIds : [];

    if (!tousLesAliments && listeAliments.length === 0 && !toutesLesHabitudes && listeHabitudes.length === 0) {
      return Response.json({ erreur: 'Sélectionnez au moins un aliment ou une habitude alimentaire.' }, { status: 400 });
    }

    const lignesAliments = tousLesAliments
      ? [{ email, type_sujet: 'aliment', sujet_id: null }]
      : listeAliments.map((id) => ({ email, type_sujet: 'aliment', sujet_id: id }));

    const lignesHabitudes = toutesLesHabitudes
      ? [{ email, type_sujet: 'habitude_alimentaire', sujet_id: null }]
      : listeHabitudes.map((id) => ({ email, type_sujet: 'habitude_alimentaire', sujet_id: id }));

    const lignesAInserer = [...lignesAliments, ...lignesHabitudes];

    let nombreCrees = 0;
    let nombreReactives = 0;
    let premierToken = null;

    for (const ligne of lignesAInserer) {
      let requeteExistant = supabase
        .from('abonnements')
        .select('id, actif, confirme, token_confirmation')
        .eq('email', ligne.email)
        .eq('type_sujet', ligne.type_sujet);

      requeteExistant = ligne.sujet_id === null
        ? requeteExistant.is('sujet_id', null)
        : requeteExistant.eq('sujet_id', ligne.sujet_id);

      const { data: existant } = await requeteExistant.maybeSingle();

      if (existant) {
        if (!existant.actif) {
          await supabase.from('abonnements').update({ actif: true }).eq('id', existant.id);
        }

        if (!existant.confirme) {
          nombreCrees++;
          if (!premierToken) premierToken = existant.token_confirmation;
        } else if (!existant.actif) {
          nombreReactives++;
        }
      } else {
        const { data: nouvelle, error } = await supabase
          .from('abonnements')
          .insert({ ...ligne, actif: true })
          .select('id, token_confirmation, confirme')
          .single();

        if (error) {
          console.error('Erreur insertion abonnement:', error.message);
          continue;
        }

        nombreCrees++;
        if (!premierToken) premierToken = nouvelle.token_confirmation;
      }
    }

    if (nombreCrees === 0 && nombreReactives === 0) {
      return Response.json({ message: 'Ces abonnements sont déjà actifs et confirmés pour cet email.' });
    }

    if (nombreCrees === 0 && nombreReactives > 0) {
      return Response.json({ message: 'Vos alertes ont été réactivées avec succès.' });
    }

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
          <p style="font-size: 13px; color: #888;">Si vous ne trouvez pas cet email la prochaine fois, pensez à vérifier vos spams / courriers indésirables.</p>
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
