import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Désabonnement en un clic (12 oct. 2026), depuis le lien présent dans chaque e-mail d'alerte.
// Le jeton (token_desabonnement d'un des abonnements de la personne) identifie l'adresse ;
// tous les abonnements de cette adresse sont alors désactivés.
// Appelée en POST depuis la page /se-desabonner (bouton de confirmation), et non directement
// par le lien de l'e-mail : les filtres de sécurité des messageries « cliquent » les liens.
export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return Response.json({ erreur: 'Lien invalide.' }, { status: 400 });
    }

    const { data: abonnement, error } = await supabase
      .from('abonnements')
      .select('email')
      .eq('token_desabonnement', token)
      .maybeSingle();

    if (error || !abonnement) {
      return Response.json({ erreur: 'Lien invalide ou déjà utilisé.' }, { status: 404 });
    }

    const { error: erreurMaj } = await supabase
      .from('abonnements')
      .update({ actif: false })
      .eq('email', abonnement.email)
      .eq('actif', true);

    if (erreurMaj) {
      console.error('Erreur désabonnement :', erreurMaj.message);
      return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
    }

    return Response.json({ message: 'Vous ne recevrez plus aucune alerte.' });
  } catch (e) {
    console.error('Erreur route se-desabonner :', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
