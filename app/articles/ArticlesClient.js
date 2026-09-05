'use client';

import { useState } from 'react';
import Link from 'next/link';

function normaliser(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function ArticlesClient({ articles }) {
  const [recherche, setRecherche] = useState('');

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
      {articlesFiltres.length === 0 && (
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
