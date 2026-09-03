import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || q.length < 2) {
    return Response.json({ resultats: [] });
  }

  const { data, error } = await supabase
    .from('aliments')
    .select('id, nom, slug')
    .eq('actif', true)
    .ilike('nom', `%${q}%`)
    .order('nom')
    .limit(10);

  if (error) {
    return Response.json({ resultats: [] });
  }

  return Response.json({ resultats: data });
}
