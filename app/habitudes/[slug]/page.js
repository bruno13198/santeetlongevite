export const revalidate = 60;

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Disclaimer from '../../components/Disclaimer';
import Breadcrumbs from '../../components/Breadcrumbs';
import ListeEtudes from '../../components/ListeEtudes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fiche d'une habitude alimentaire (régime, pratique).
// 5 oct. 2026 : affichage des études aligné sur la fiche aliment (composant ListeEtudes,
// niveaux de preuve Oxford) au lieu de l'ancien badge de fiabilité.
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
        <Link href="/veille-scientifique">← Retour à la veille scientifique</Link>
      </main>
    );
  }

  // Études liées à cette habitude via la table de liaison
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

      <Link href="/veille-scientifique?onglet=habitudes" style={{ color: '#555' }}>← Retour à la veille scientifique</Link>

      <h1 style={{ marginTop: '16px' }}>{habitude.nom}</h1>
      {habitude.description && <p>{habitude.description}</p>}

      <h2>Études scientifiques ({etudes.length})</h2>

      {etudes.length === 0 ? (
        <p style={{ color: '#6B6E63' }}>Aucune étude pour le moment.</p>
      ) : (
        <ListeEtudes etudes={etudes} />
      )}

      <Disclaimer />
    </main>
  );
}
