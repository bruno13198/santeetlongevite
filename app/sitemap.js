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
    .eq('actif', true)
    .range(0, 3999);

  const { data: articles } = await supabase
    .from('articles')
    .select('slug')
    .eq('publie', true)
    .range(0, 999);

  const urlsAliments = (aliments || []).map((aliment) => ({
    url: `${baseUrl}/aliments/${aliment.slug}`,
    lastModified: new Date(),
  }));

  const urlsArticles = (articles || []).map((article) => ({
    url: `${baseUrl}/articles/${article.slug}`,
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
    {
      url: `${baseUrl}/veille-scientifique`,
      lastModified: new Date(),
    },
    ...urlsArticles,
    ...urlsAliments,
  ];
}
