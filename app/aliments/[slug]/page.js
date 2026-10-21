export const revalidate = 60;

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Disclaimer from '../../components/Disclaimer';
import Breadcrumbs from '../../components/Breadcrumbs';
import SectionEtudes from '../../components/SectionEtudes';
import SuivreSujet from '../../components/SuivreSujet';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Titre et description pour Google (20 oct. 2026). Le nom est raccourci à sa première partie.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data: aliment } = await supabase
    .from('aliments')
    .select('nom, description, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (!aliment || !aliment.actif) return { title: 'Aliment introuvable | ScienceTruths' };

  const nomCourt = aliment.nom.split(', ')[0];
  return {
    title: `${nomCourt} : bienfaits, risques et ce que disent les études | ScienceTruths`,
    description:
      aliment.description ||
      `Les études scientifiques sur ${nomCourt}, résumées en français et classées par niveau de preuve.`,
    alternates: { canonical: `https://sciencetruths.com/aliments/${slug}` },
  };
}

export default async function FicheAliment({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  // Récupère l'aliment correspondant au slug
  const { data: aliment, error: erreurAliment } = await supabase
    .from('aliments')
    .select('*')
    .eq('slug', slug)
    .single();

  // Fiche inexistante ou désactivée : vraie page 404, pour que Google l'oublie.
  if (erreurAliment || !aliment || !aliment.actif) notFound();

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
      <SuivreSujet type="aliment" sujetId={aliment.id} nom={aliment.nom} />
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

      {/* 21 oct. 2026 : études chargées page par page par la base de données */}
      <SectionEtudes type="aliment" sujetId={aliment.id} chemin={`/aliments/${slug}`} searchParams={sp} />

      <Disclaimer />
    </main>
  );
}
