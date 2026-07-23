import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function Home() {
  const { data: aliments, error } = await supabase
    .from('aliments')
    .select('*');

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Super Aliments Santé</h1>
      <p>Liste des aliments en base :</p>

      {error && <p style={{ color: 'red' }}>Erreur : {error.message}</p>}

      <ul>
        {aliments && aliments.map((aliment) => (
          <li key={aliment.id} style={{ marginBottom: '10px' }}>
            <strong>{aliment.nom}</strong> — {aliment.categorie}
            <br />
            <span style={{ color: '#555' }}>{aliment.description}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
