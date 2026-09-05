import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { token, abonnementId } = await request.json();

    if (!token || !abonnementId) {
      return Response.json({ erreur: 'Requête invalide.' }, { status: 400 });
    }

    // Vérifie que le lien magique est valide et pas expiré
    const { data: lien, error: erreurLien } = await supabase
      .from('liens_magiques')
      .select('email, date_expiration')
      .eq('token', token)
      .maybeSingle();

    if (erreurLien || !lien || new Date(lien.date_expiration) < new Date()) {
      return Response.json({ erreur: 'Lien expiré ou invalide.' }, { status: 401 });
    }

    // Vérifie que l'abonnement à supprimer appartient bien à cet email
    // (empêche quelqu'un de désabonner un autre email en devinant un id)
    const { data: abonnement, error: erreurAbonnement } = await supabase
      .from('abonnements')
      .select('id, email')
      .eq('id', abonnementId)
      .eq('email', lien.email)
      .maybeSingle();

    if (erreurAbonnement || !abonnement) {
      return Response.json({ erreur: 'Abonnement introuvable.' }, { status: 404 });
    }

    await supabase.from('abonnements').update({ actif: false }).eq('id', abonnementId);

    return Response.json({ message: 'Désabonné avec succès.' });
  } catch (e) {
    console.error('Erreur route lien-magique/desabonner:', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
