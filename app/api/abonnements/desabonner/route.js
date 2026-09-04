import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return Response.redirect('https://sciencetruths.com/desabonnement-erreur');
  }

  const { data: abonnement, error } = await supabase
    .from('abonnements')
    .select('id')
    .eq('token_desabonnement', token)
    .maybeSingle();

  if (error || !abonnement) {
    return Response.redirect('https://sciencetruths.com/desabonnement-erreur');
  }

  await supabase
    .from('abonnements')
    .update({ actif: false })
    .eq('id', abonnement.id);

  return Response.redirect('https://sciencetruths.com/desabonnement-confirme');
}
