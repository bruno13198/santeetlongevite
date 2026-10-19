export const revalidate = 60;

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Disclaimer from '../../components/Disclaimer';
import Breadcrumbs from '../../components/Breadcrumbs';
import ListeEtudes from '../../components/ListeEtudes';
import SuivreSujet from '../../components/SuivreSujet';
import ArticlesLies from '../../components/ArticlesLies';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fiche d'un nutriment, complément ou plante (10 oct. 2026).
// Même présentation que les fiches aliments et habitudes (composant ListeEtudes,
// niveaux de preuve Oxford, signalement d'erreur, encart relecteurs).

const LIBELLES_CATEGORIES = {
  nutriment: 'Nutriment',
  complement: 'Complément alimentaire',
  plante: 'Plante',
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data: nutriment } = await supabase
    .from('nutriments')
    .select('nom, description')
    .eq('slug', slug)
    .maybeSingle();

  if (!nutriment) return { title: 'Nutriment introuvable | ScienceTruths' };

  return {
    title: `${nutriment.nom} : ce que disent les études | ScienceTruths`,
    description:
      nutriment.description ||
      `Les études scientifiques sur ${nutriment.nom}, résumées en français et classées par niveau de preuve.`,
  };
}

export default async function FicheNutriment({ params }) {
  const { slug } = await params;

  const { data: nutriment, error: erreurNutriment } = await supabase
    .from('nutriments')
    .select('*')
    .eq('slug', slug)
    .eq('actif', true)
    .maybeSingle();

  // Fiche inexistante ou désactivée : vraie page 404, pour que Google l'oublie.
  if (erreurNutriment || !nutriment) notFound();

  // Études liées à ce nutriment via la table de liaison
  const { data: liaisons } = await supabase
    .from('nutriments_etudes')
    .select('etude_id')
    .eq('nutriment_id', nutriment.id);

  const etudeIds = liaisons ? liaisons.map((l) => l.etude_id) : [];

  let etudes = [];
  if (etudeIds.length > 0) {
    const { data: etudesData } = await supabase
            .from('etudes')
      .select('id, titre_traduit, titre_original, source, date_publication, auteurs, resume_simplifie, resume_reformule, url_originale, niveau_preuve, design_etude, ajustement_preuve, nb_participants, niveau_fiabilite, type_etude')
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
          { nom: nutriment.nom, url: `https://sciencetruths.com/nutriments/${slug}` },
        ]}
      />

      <Link href="/veille-scientifique?onglet=nutriments" style={{ color: '#555' }}>
        ← Retour à la veille scientifique
      </Link>

      <h1 style={{ marginTop: '16px' }}>{nutriment.nom}</h1>
      <SuivreSujet type="nutriment" sujetId={nutriment.id} nom={nutriment.nom} />
      {LIBELLES_CATEGORIES[nutriment.categorie] && (
        <p style={{ color: '#6B6E63' }}>{LIBELLES_CATEGORIES[nutriment.categorie]}</p>
      )}
      {nutriment.description && <p>{nutriment.description}</p>}

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
