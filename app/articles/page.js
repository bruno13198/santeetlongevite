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
  const [recherche, setRecherche] = useState('');
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

  function normaliser(texte) {
    return texte
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const rechercheNorm = normaliser(recherche);

  const articlesFiltres = articles.filter((article) =>
    normaliser(article.titre).includes(rechercheNorm)
  );

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Link href="/" style={{ color: '#555' }}>← Retour à l'accueil</Link>
      <h1 style={{ marginTop: '16px' }}>Articles</h1>

      <input
        type="text"
        placeholder="Rechercher un article..."
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '16px',
          marginBottom: '24px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          boxSizing: 'border-box',
        }}
      />

      {chargement && <p>Chargement...</p>}
      {!chargement && articlesFiltres.length === 0 && (
        <p style={{ color: '#888' }}>Aucun article trouvé.</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {articlesFiltres.map((article) => (
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
