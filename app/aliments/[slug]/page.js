import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function FicheAliment({ params }) {
  const { slug } = params;

  // Récupère l'aliment correspondant au slug
  const { data: aliment, error: erreurAliment } = await supabase
    .from('aliments')
    .select('*')
    .eq('slug', slug)
    .single();

  if (erreurAliment || !aliment) {
    return (
      <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
        <p>Aliment introuvable.</p>
        <Link href="/">← Retour à la recherche</Link>
      </main>
    );
  }

  // Récupère les études liées à cet aliment via la table de liaison
  const { data: liaisons } = await supabase
    .from('aliments_etudes')
    .select('etude_id')
    .eq('aliment_id', aliment.id);

  const etudeIds = liaisons ? liaisons.map((l) => l.etude_id) : [];

  let etudes = [];
  if (etudeIds.length > 0) {
    const { data: etudesData } = await supabase
      .from('etudes')
      .select('*')
      .in('id', etudeIds);
    etudes = etudesData || [];
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Link href="/" style={{ color: '#555' }}>← Retour à la recherche</Link>

      <h1 style={{ marginTop: '16px' }}>{aliment.nom}</h1>
      {aliment.nom_scientifique && (
        <p style={{ fontStyle: 'italic', color: '#888' }}>{aliment.nom_scientifique}</p>
      )}
      <p style={{ color: '#888' }}>{aliment.categorie}</p>
      <p>{aliment.description}</p>

      {aliment.composition && (
        <div style={{ marginTop: '16px', marginBottom: '32px' }}>
          <strong>Composition :</strong>
          <ul>
            {Object.entries(aliment.composition).map(([cle, valeur]) => (
              <li key={cle}>{cle.replaceAll('_', ' ')} : {valeur}</li>
            ))}
          </ul>
        </div>
      )}

      <h2>Études scientifiques ({etudes.length})</h2>

      {etudes.length === 0 && <p style={{ color: '#888' }}>Aucune étude pour le moment.</p>}

      {etudes.map((etude) => (
        <div
          key={etude.id}
          style={{
            marginBottom: '20px',
            padding: '16px',
            border: '1px solid #eee',
            borderRadius: '8px',
          }}
        >
          <strong>{etude.titre_traduit || etude.titre_original}</strong>
          <p style={{ color: '#888', fontSize: '14px' }}>
            {etude.source} · {etude.date_publication} · {etude.auteurs}
          </p>

          <p><strong>Résumé simplifié :</strong></p>
          <p>{etude.resume_simplifie}</p>

          <p><strong>Résumé reformulé :</strong></p>
          <p>{etude.resume_reformule}</p>

          {etude.url_originale && (
            <a href={etude.url_originale} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px' }}>
              Voir l'étude originale →
            </a>
          )}
        </div>
      ))}
    </main>
  );
}
