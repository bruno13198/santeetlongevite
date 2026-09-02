import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, slug } = await request.json();

    if (!email || !slug) {
      return Response.json({ erreur: 'Email et aliment requis.' }, { status: 400 });
    }

    // Validation email basique
    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
      return Response.json({ erreur: 'Adresse email invalide.' }, { status: 400 });
    }

    // Récupérer l'aliment correspondant au slug
    const { data: aliment, error: erreurAliment } = await supabase
      .from('aliments')
      .select('id, nom')
      .eq('slug', slug)
      .single();

    if (erreurAliment || !aliment) {
      return Response.json({ erreur: 'Aliment introuvable.' }, { status: 404 });
    }

    // Vérifier si un abonnement existe déjà (même email + même sujet)
    const { data: existant } = await supabase
      .from('abonnements')
      .select('id, confirme, actif')
      .eq('email', email)
      .eq('type_sujet', 'aliment')
      .eq('sujet_id', aliment.id)
      .maybeSingle();

    if (existant) {
      if (existant.confirme && existant.actif) {
        return Response.json({ message: 'Vous êtes déjà abonné à cet aliment.' });
      }
      if (!existant.actif) {
        // Réactiver un abonnement désactivé
        await supabase
          .from('abonnements')
          .update({ actif: true })
          .eq('id', existant.id);
      }
      // Si non confirmé, on renvoie simplement un nouveau mail de confirmation
      const { data: abonnementMisAJour } = await supabase
        .from('abonnements')
        .select('token_confirmation')
        .eq('id', existant.id)
        .single();

      await envoyerEmailConfirmation(email, aliment.nom, abonnementMisAJour.token_confirmation);
      return Response.json({ message: 'Un email de confirmation vous a été renvoyé.' });
    }

    // Créer le nouvel abonnement
    const { data: nouvelAbonnement, error: erreurInsert } = await supabase
      .from('abonnements')
      .insert({
        email,
        type_sujet: 'aliment',
        sujet_id: aliment.id,
      })
      .select('token_confirmation')
      .single();

    if (erreurInsert) {
      console.error('Erreur insertion abonnement:', erreurInsert.message);
      return Response.json({ erreur: 'Erreur lors de l\'inscription.' }, { status: 500 });
    }

    await envoyerEmailConfirmation(email, aliment.nom, nouvelAbonnement.token_confirmation);

    return Response.json({ message: 'Vérifiez votre boîte mail pour confirmer votre abonnement.' });
  } catch (e) {
    console.error('Erreur route abonnements:', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

async function envoyerEmailConfirmation(email, nomAliment, token) {
  const lienConfirmation = `https://sciencetruths.com/api/abonnements/confirmer?token=${token}`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'ScienceTruths', email: 'alertes@sciencetruths.com' },
      to: [{ email }],
      subject: `Confirmez votre abonnement aux alertes sur ${nomAliment}`,
      htmlContent: `
        <p>Bonjour,</p>
        <p>Vous avez demandé à recevoir des alertes par email lorsqu'une nouvelle étude scientifique est ajoutée sur <strong>${nomAliment}</strong> sur ScienceTruths.</p>
        <p>Pour confirmer cet abonnement, cliquez sur ce lien :</p>
        <p><a href="${lienConfirmation}">Confirmer mon abonnement</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur envoi email Brevo: ${errText}`);
  }
}
