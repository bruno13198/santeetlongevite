import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Confirmation en deux temps (2 oct. 2026) : le lien de l'e-mail (GET) affiche seulement
// une page avec un bouton ; seul le clic sur ce bouton (POST) confirme l'inscription.
// Les filtres de sécurité des messageries ouvrent les liens, mais ne cliquent pas sur les boutons.

function echapper(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const token = searchParams.get('token');

  if (!email || !token) {
    return Response.redirect('https://sciencetruths.com/abonnement-erreur');
  }

  const page = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Confirmer vos alertes — ScienceTruths</title>
</head>
<body style="font-family: sans-serif; max-width: 560px; margin: 60px auto; padding: 0 20px; color: #222; line-height: 1.6;">
  <h1 style="font-size: 22px;">Confirmer vos alertes</h1>
  <p>Vous êtes sur le point de recevoir les alertes ScienceTruths à l'adresse <strong>${echapper(email)}</strong>.</p>
  <form method="POST" action="/api/abonnements/confirmer-tout">
    <input type="hidden" name="email" value="${echapper(email)}">
    <input type="hidden" name="token" value="${echapper(token)}">
    <button type="submit" style="background: #27500A; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer;">
      Confirmer mes alertes
    </button>
  </form>
  <p style="font-size: 13px; color: #6B6E63; margin-top: 24px;">Si vous n'êtes pas à l'origine de cette demande, fermez simplement cette page : aucune alerte ne vous sera envoyée.</p>
</body>
</html>`;

  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function POST(request) {
  const formulaire = await request.formData();
  const email = formulaire.get('email');
  const token = formulaire.get('token');

  if (!email || !token) {
    return Response.redirect('https://sciencetruths.com/abonnement-erreur', 303);
  }

  // Vérifie que ce token correspond bien à un abonnement existant pour cet email
  // (preuve que la personne a bien accès à cette boîte mail).
  const { data: abonnementVerif, error: erreurVerif } = await supabase
    .from('abonnements')
    .select('id')
    .eq('email', email)
    .eq('token_confirmation', token)
    .maybeSingle();

  if (erreurVerif || !abonnementVerif) {
    return Response.redirect('https://sciencetruths.com/abonnement-erreur', 303);
  }

  // Une fois la preuve établie, confirme TOUS les abonnements non confirmés de cet email.
  await supabase
    .from('abonnements')
    .update({ confirme: true, date_confirmation: new Date().toISOString() })
    .eq('email', email)
    .eq('confirme', false);

  return Response.redirect('https://sciencetruths.com/abonnement-confirme', 303);
}
