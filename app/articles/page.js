'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Articles() {
  const [articles, setArticles] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    async function chargerArticles() {
     const { data, error } = await supabase
  .from('articles')
  .select('titre, slug, created_at')
  .eq('publie', true)
  .neq('slug', 'Pourquoi-ce-site')
  .order('created_at', { ascending: false });

      if (!error) {
        setArticles(data);
      }
      setChargement(false);
    }
    chargerArticles();
  }, []);

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Link href="/" style={{ color: '#555' }}>← Retour à l'accueil</Link>
      <h1 style={{ marginTop: '16px' }}>Articles</h1>

      {chargement && <p>Chargement...</p>}
      {!chargement && articles.length === 0 && (
        <p style={{ color: '#888' }}>Aucun article publié pour le moment.</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {articles.map((article) => (
          <li
            key={article.slug}
            style={{
              marginBottom: '16px',
              padding: '16px',
              border: '1px solid #eee',
              borderRadius: '8px',
            }}
          >
            <Link href={`/articles/${article.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong style={{ fontSize: '18px' }}>{article.titre}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
