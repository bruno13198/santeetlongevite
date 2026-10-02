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

export default async function FicheAliment({ params }) {
  const { slug } = await params;

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
      .in('id', etudeIds)
      .order('date_publication', { ascending: false, nullsFirst: false });
    etudes = etudesData || [];
  }

  // Récupère TOUS les articles publiés liés à cet aliment via la table de liaison
  const { data: liaisonsArticles } = await supabase
    .from('articles_aliments')
    .select('article_id')
    .eq('aliment_id', aliment.id);

  const articleIds = liaisonsArticles ? liaisonsArticles.map((l) => l.article_id) : [];

  let articlesLies = [];
  if (articleIds.length > 0) {
    const { data: articlesData } = await supabase
      .from('articles')
      .select('titre, slug')
      .in('id', articleIds)
      .eq('publie', true)
      .order('titre', { ascending: true });
    articlesLies = articlesData || [];
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Veille scientifique', url: 'https://sciencetruths.com/veille-scientifique' },
          { nom: aliment.nom, url: `https://sciencetruths.com/aliments/${slug}` },
        ]}
      />

      <Link href="/veille-scientifique" style={{ color: '#555' }}>← Retour à la recherche</Link>

      <h1 style={{ marginTop: '16px' }}>{aliment.nom}</h1>
      {aliment.nom_scientifique && (
        <p style={{ fontStyle: 'italic', color: '#6B6E63' }}>{aliment.nom_scientifique}</p>
      )}
      <p style={{ color: '#6B6E63' }}>{aliment.categorie}</p>
      <p>{aliment.description}</p>

      {articlesLies.length > 0 && (
        <div style={{ marginTop: '16px', marginBottom: '24px' }}>
          {articlesLies.map((article) => (
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
      )}

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

      {etudes.length === 0 ? (
        <p style={{ color: '#6B6E63' }}>Aucune étude pour le moment.</p>
      ) : (
        <ListeEtudes etudes={etudes} />
      )}

      <Disclaimer />
    </main>
  );
}
