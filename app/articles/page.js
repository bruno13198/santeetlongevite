import { createClient } from '@supabase/supabase-js';
import ArticlesClient from './ArticlesClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const revalidate = 60;

// 28 oct. 2026 : les pages du site (colonne page_site, ex. « Pourquoi ce site ») sont exclues de la liste.
export default async function ArticlesPage() {
  const { data, error } = await supabase
    .from('articles')
    .select('titre, slug, created_at')
    .eq('publie', true)
    .eq('page_site', false)
    .order('created_at', { ascending: false });

  const articlesUniques = error
    ? []
    : Array.from(new Map(data.map((article) => [article.slug, article])).values());

  return <ArticlesClient articles={articlesUniques} />;
}
