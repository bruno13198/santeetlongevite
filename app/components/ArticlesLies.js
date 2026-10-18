// Bloc « Lire l'article complet » (18 oct. 2026) pour les fiches régimes et nutriments.
// Composant serveur : lit la table de liaison correspondant au type de fiche.
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const LIAISONS = {
  habitude: { table: 'articles_habitudes', cle: 'habitude_id' },
  nutriment: { table: 'articles_nutriments', cle: 'nutriment_id' },
};

export default async function ArticlesLies({ type, sujetId }) {
  const liaison = LIAISONS[type];
  if (!liaison) return null;

  const { data: liens } = await supabase.from(liaison.table).select('article_id').eq(liaison.cle, sujetId);
  const articleIds = liens ? liens.map((l) => l.article_id) : [];
  if (articleIds.length === 0) return null;

  const { data: articles } = await supabase
    .from('articles')
    .select('titre, slug')
    .in('id', articleIds)
    .eq('publie', true)
    .order('titre', { ascending: true });
  if (!articles || articles.length === 0) return null;

  return (
    <div style={{ marginTop: '16px', marginBottom: '24px' }}>
      {articles.map((article) => (
        <Link
          key={article.slug}
          href={`/articles/${article.slug}`}
          style={{
            display: 'block',
            marginBottom: '8px',
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          📖 Lire l'article complet : <strong>{article.titre}</strong>
        </Link>
      ))}
    </div>
  );
}
