export const revalidate = 60;

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Disclaimer from '../../components/Disclaimer';
import Breadcrumbs from '../../components/Breadcrumbs';
import SectionEtudes from '../../components/SectionEtudes';
import SuivreSujet from '../../components/SuivreSujet';
import ArticlesLies from '../../components/ArticlesLies';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fiche d'un nutriment, complément ou plante (10 oct. 2026).

const LIBELLES_CATEGORIES = {
  nutriment: 'Nutriment',
  complement: 'Complément alimentaire',
  plante: 'Plante',
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data: nutriment } = await supabase
    .from('nutriments')
    .select('nom, description, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (!nutriment || !nutriment.actif) return { title: 'Nutriment introuvable | ScienceTruths' };

  return {
    title: `${nutriment.nom} : efficacité, risques et ce que disent les études | ScienceTruths`,
    description:
      nutriment.description ||
      `Les études scientifiques sur ${nutriment.nom}, résumées en français et classées par niveau de preuve.`,
    alternates: { canonical: `https://sciencetruths.com/nutriments/${slug}` },
  };
}

export default async function FicheNutriment({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  const { data: nutriment, error: erreurNutriment } = await supabase
    .from('nutriments')
    .select('*')
    .eq('slug', slug)
    .eq('actif', true)
    .maybeSingle();

  // Fiche inexistante ou désactivée : vraie page 404, pour que Google l'oublie.
  if (erreurNutriment || !nutriment) notFound();

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Veille scientifique', url: 'https://sciencetruths.com/veille-scientifique' },
          { nom: nutriment.nom, url: `https://sciencetruths.com/nutriments/${slug}` },
        ]}
      />

      <Link href="/veille-scientifique?onglet=nutriments" style={{ color: '#555' }}>
        ← Retour à la veille scientifique
      </Link>

      <h1 style={{ marginTop: '16px' }}>{nutriment.nom}</h1>
      <SuivreSujet type="nutriment" sujetId={nutriment.id} nom={nutriment.nom} />
      <ArticlesLies type="nutriment" sujetId={nutriment.id} />
      {LIBELLES_CATEGORIES[nutriment.categorie] && (
        <p style={{ color: '#6B6E63' }}>{LIBELLES_CATEGORIES[nutriment.categorie]}</p>
      )}
      {nutriment.description && <p>{nutriment.description}</p>}

      {/* 21 oct. 2026 : études chargées page par page par la base de données */}
      <SectionEtudes type="nutriment" sujetId={nutriment.id} chemin={`/nutriments/${slug}`} searchParams={sp} />

      <Disclaimer />
    </main>
  );
}
