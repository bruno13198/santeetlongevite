'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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
      const { data, error } = await supabase.from('aliments').select('*');
      if (error) {
        setErreur(error.message);
      } else {
        setAliments(data);
      }
      setChargement(false);
    }
    chargerAliments();
  }, []);

  const alimentsFiltres = aliments.filter((aliment) =>
    aliment.nom.toLowerCase().includes(recherche.toLowerCase())
  );

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Super Aliments Santé</h1>

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
            <strong style={{ fontSize: '18px' }}>{aliment.nom}</strong>
            <span style={{ color: '#888' }}> — {aliment.categorie}</span>
            <br />
            <span style={{ color: '#555' }}>{aliment.description}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
