import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return Response.json({ valide: false }, { status: 400 });
  }

  const { data: lien, error } = await supabase
    .from('liens_magiques')
    .select('email, date_expiration')
    .eq('token', token)
    .maybeSingle();

  if (error || !lien) {
    return Response.json({ valide: false });
  }

  if (new Date(lien.date_expiration) < new Date()) {
    return Response.json({ valide: false, erreur: 'expire' });
  }

  // Récupère les abonnements actifs et confirmés de cette personne
  const { data: abonnements } = await supabase
    .from('abonnements')
    .select('id, type_sujet, sujet_id, date_creation')
    .eq('email', lien.email)
    .eq('confirme', true)
    .eq('actif', true);

  // Pour les abonnements liés à un aliment précis, on va chercher son nom
  const idsAliments = (abonnements || [])
    .filter((a) => a.sujet_id !== null)
    .map((a) => a.sujet_id);

  let alimentsParId = {};
  if (idsAliments.length > 0) {
    const { data: aliments } = await supabase
      .from('aliments')
      .select('id, nom, slug')
      .in('id', idsAliments);
    alimentsParId = Object.fromEntries((aliments || []).map((a) => [a.id, a]));
  }

  const abonnementsEnrichis = (abonnements || []).map((a) => ({
    id: a.id,
    type_sujet: a.type_sujet,
    tous: a.sujet_id === null,
    aliment: a.sujet_id ? alimentsParId[a.sujet_id] || null : null,
    date_creation: a.date_creation,
  }));

  return Response.json({
    valide: true,
    email: lien.email,
    abonnements: abonnementsEnrichis,
  });
}
