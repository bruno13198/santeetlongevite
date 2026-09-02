import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return Response.redirect('https://sciencetruths.com/abonnement-erreur');
  }

  const { data: abonnement, error } = await supabase
    .from('abonnements')
    .select('id, confirme')
    .eq('token_confirmation', token)
    .maybeSingle();

  if (error || !abonnement) {
    return Response.redirect('https://sciencetruths.com/abonnement-erreur');
  }

  if (!abonnement.confirme) {
    await supabase
      .from('abonnements')
      .update({ confirme: true, date_confirmation: new Date().toISOString() })
      .eq('id', abonnement.id);
  }

  return Response.redirect('https://sciencetruths.com/abonnement-confirme');
}
