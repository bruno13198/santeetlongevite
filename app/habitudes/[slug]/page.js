import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Disclaimer from '../../components/Disclaimer';
import Breadcrumbs from '../../components/Breadcrumbs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function FicheHabitude({ params }) {
  const { slug } = await params;

  const { data: habitude, error: erreurHabitude } = await supabase
    .from('habitudes_alimentaires')
    .select('*')
    .eq('slug', slug)
    .single();

  if (erreurHabitude || !habitude) {
    return (
      <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
        <p>Habitude alimentaire introuvable.</p>
        <Link href="/">← Retour à la recherche</Link>
      </main>
    );
  }

  const { data: liaisons } = await supabase
    .from('habitudes_etudes')
    .select('etude_id')
    .eq('habitude_id', habitude.id);

  const etudeIds = liaisons ? liaisons.map((l) => l.etude_id) : [];

  let etudes = [];
  if (etudeIds.length > 0) {
    const { data: etudesData } = await supabase
      .from('etudes')
      .select('*')
      .in('id', etudeIds)
      .order('date_publication', { ascending: false, nullsFirst: false });
    etudes = etudesData || [];
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Veille scientifique', url: 'https://sciencetruths.com/veille-scientifique' },
          { nom: habitude.nom, url: `https://sciencetruths.com/habitudes/${slug}` },
        ]}
      />

      <Link href="/veille-scientifique" style={{ color: '#555' }}>← Retour à la recherche</Link>

      <h1 style={{ marginTop: '16px' }}>{habitude.nom}</h1>
      {habitude.description && <p>{habitude.description}</p>}

      <h2>Études scientifiques ({etudes.length})</h2>

      {etudes.length === 0 && <p style={{ color: '#6B6E63' }}>Aucune étude pour le moment.</p>}

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
          {etude.niveau_fiabilite === 'haute' && (
            <span style={{ backgroundColor: '#d4edda', color: '#155724', padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold' }}>
              🟢 Haute fiabilité
            </span>
          )}
          {etude.niveau_fiabilite === 'moderee' && (
            <span style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold' }}>
              🟡 Fiabilité modérée
            </span>
          )}
          {etude.niveau_fiabilite === 'preliminaire' && (
            <span style={{ backgroundColor: '#ffe5d0', color: '#9a4d00', padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold' }}>
              🟠 Préliminaire
            </span>
          )}
          {(etude.type_etude || etude.nb_participants) && (
            <p style={{ color: '#555', fontSize: '13px', fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' }}>
              {[
                etude.type_etude,
                etude.nb_participants ? `${etude.nb_participants} participants` : null,
              ].filter(Boolean).join(' • ')}
            </p>
          )}

          <strong style={{ display: 'block', marginTop: '4px' }}>{etude.titre_traduit || etude.titre_original}</strong>
          <p style={{ color: '#6B6E63', fontSize: '14px' }}>
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
      <Disclaimer />
    </main>
  );
}
