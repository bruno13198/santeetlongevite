'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [aliments, setAliments] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    async function chargerAliments() {
      const { data, error } = await supabase.from('aliments').select('*').range(0, 3999);
      if (error) {
        setErreur(error.message);
      } else {
        setAliments(data);
      }
      setChargement(false);
    }
    chargerAliments();
  }, []);

  function normaliser(texte) {
    return texte
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // enlève les accents
  }

  const rechercheNorm = normaliser(recherche);
  const motsRecherche = rechercheNorm.split(/[^a-z0-9]+/).filter((m) => m !== '');
  const alimentsFiltres = aliments.filter((aliment) => {
    if (motsRecherche.length === 0) return false;
    const motsDuNom = normaliser(aliment.nom).split(/[^a-z0-9]+/);
    return motsRecherche.every((motRecherche) => {
      if (motRecherche.length <= 3) {
        return motsDuNom.some((mot) => mot === motRecherche);
      }
      return motsDuNom.some((mot) => mot.startsWith(motRecherche));
    });
  });

    return motsDuNom.some((mot) => mot.startsWith(rechercheNorm));
  });

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Super Aliments Santé</h1>
      <p style={{ marginBottom: '24px' }}>
        <Link href="/a-propos" style={{ color: '#555' }}>À propos de ce site</Link>
{' · '}
<Link href="/articles" style={{ color: '#555' }}>Articles</Link>
{' · '}
<Link href="/articles/Pourquoi-ce-site" style={{ color: '#555' }}>Pourquoi ce site ?</Link>
      </p>

      <input
        type="text"
        placeholder="Rechercher un aliment (ex: curcuma)..."
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

      {erreur && <p style={{ color: 'red' }}>Erreur : {erreur}</p>}
      {chargement && <p>Chargement...</p>}

      {!chargement && alimentsFiltres.length === 0 && (
        <p style={{ color: '#888' }}>Aucun aliment trouvé pour "{recherche}".</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {alimentsFiltres.map((aliment) => (
          <li
            key={aliment.id}
            style={{
              marginBottom: '16px',
              padding: '16px',
              border: '1px solid #eee',
              borderRadius: '8px',
            }}
          >
            <Link href={`/aliments/${aliment.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong style={{ fontSize: '18px' }}>{aliment.nom.split(',')[0]}</strong>
              {aliment.nom.includes(',') && (
                <span style={{ color: '#aaa', fontSize: '13px' }}> ({aliment.nom.split(',').slice(1).join(',').trim()})</span>
              )}
              <span style={{ color: '#888' }}> — {aliment.categorie}</span>
              <br />
              <span style={{ color: '#555' }}>{aliment.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
