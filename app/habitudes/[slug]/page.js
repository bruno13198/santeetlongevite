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

// Fiche d'une habitude alimentaire (régime, pratique).
// Titre et description pour Google (20 oct. 2026).
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data: habitude } = await supabase
    .from('habitudes_alimentaires')
    .select('nom, description, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (!habitude || !habitude.actif) return { title: 'Régime introuvable | ScienceTruths' };

  return {
    title: `${habitude.nom} : efficacité, risques et ce que disent les études | ScienceTruths`,
    description:
      habitude.description ||
      `Les études scientifiques sur ${habitude.nom}, résumées en français et classées par niveau de preuve.`,
    alternates: { canonical: `https://sciencetruths.com/habitudes/${slug}` },
  };
}

export default async function FicheHabitude({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  const { data: habitude, error: erreurHabitude } = await supabase
    .from('habitudes_alimentaires')
    .select('*')
    .eq('slug', slug)
    .single();

  // Fiche inexistante ou désactivée : vraie page 404, pour que Google l'oublie.
  if (erreurHabitude || !habitude || !habitude.actif) notFound();

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
      <SuivreSujet type="habitude" sujetId={habitude.id} nom={habitude.nom} />
      <ArticlesLies type="habitude" sujetId={habitude.id} />
      {habitude.description && <p>{habitude.description}</p>}

      {/* 21 oct. 2026 : études chargées page par page par la base de données */}
      <SectionEtudes type="habitude" sujetId={habitude.id} chemin={`/habitudes/${slug}`} searchParams={sp} />

      <Disclaimer />
    </main>
  );
}
