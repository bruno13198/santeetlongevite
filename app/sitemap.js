import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function sitemap() {
  const baseUrl = 'https://sciencetruths.com';

  const { data: aliments } = await supabase
    .from('aliments')
    .select('slug')
    .range(0, 3999);

  const urlsAliments = (aliments || []).map((aliment) => ({
    url: `${baseUrl}/aliments/${aliment.slug}`,
    lastModified: new Date(),
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/a-propos`,
      lastModified: new Date(),
    },
    ...urlsAliments,
  ];
}
