import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const token = searchParams.get('token');

  if (!email || !token) {
    return Response.redirect('https://sciencetruths.com/abonnement-erreur');
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
    return Response.redirect('https://sciencetruths.com/abonnement-erreur');
  }

  // Une fois la preuve établie, confirme TOUS les abonnements non confirmés de cet email.
  await supabase
    .from('abonnements')
    .update({ confirme: true, date_confirmation: new Date().toISOString() })
    .eq('email', email)
    .eq('confirme', false);

  return Response.redirect('https://sciencetruths.com/abonnement-confirme');
}
