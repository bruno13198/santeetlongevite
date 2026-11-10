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

// Met en minuscule la première lettre d'un nom (« Performance sportive » → « performance sportive »),
// sauf pour les sigles (« SOPK » reste « SOPK »).
function enMinuscule(nom) {
  if (!nom || nom.length < 2 || nom[1] !== nom[1].toLowerCase()) return nom || '';
  return nom[0].toLowerCase() + nom.slice(1);
}

// 4 nov. 2026 : la fiche complète et la fiche filtrée par problème de santé peuvent apparaître
// dans Google, chacune avec son propre titre. Toutes les autres versions (niveau, tri, recherche,
// pages suivantes) sont interdites d'indexation, mais leurs liens restent suivis.
export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const { data: nutriment } = await supabase
    .from('nutriments')
    .select('id, nom, description, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (!nutriment || !nutriment.actif) return { title: 'Nutriment introuvable | ScienceTruths' };

  const adresse = `https://sciencetruths.com/nutriments/${slug}`;
  const autresFiltres = Boolean(sp.niveau || sp.revues || sp.tri || sp.q || (sp.page && sp.page !== '1'));

  // Problème de santé demandé : on vérifie qu'il existe.
  let probleme = null;
  if (sp.probleme) {
    const { data } = await supabase
      .from('problemes_sante')
      .select('slug, nom')
      .eq('slug', String(sp.probleme))
      .maybeSingle();
    probleme = data || null;
  }

  // Fiche filtrée par problème seul : page à part entière, avec son propre titre.
  if (probleme && !autresFiltres) {
        const sujet = `${nutriment.nom} : ${enMinuscule(probleme.nom)}`;
    return {
      title: `${sujet}. Ce que disent les études | ScienceTruths`,
      description: `${sujet} : les études scientifiques, résumées en français et classées par niveau de preuve.`,
      alternates: { canonical: `${adresse}?probleme=${probleme.slug}` },
    };
  }

    // 6 nov. 2026 : « dangers » (le mot tapé dans Google) dans le titre, et nombre d'études dans la description.
  function descriptionGoogle(nom, nb, descriptionFiche) {
    if (!nb) return descriptionFiche || `Ce que disent les études scientifiques sur ${nom}, résumées en français et classées par niveau de preuve.`;
    const debut = nb === 1 ? 'ce que dit vraiment 1 étude scientifique' : `ce que disent vraiment ${nb.toLocaleString('fr-FR')} études scientifiques`;
    return `${nom} : ${debut}. Efficacité, dangers et niveau de preuve de chaque étude, résumés en français.`;
  }
  const { count: nbEtudes } = await supabase
    .from('nutriments_etudes')
    .select('etude_id', { count: 'exact', head: true })
    .eq('nutriment_id', nutriment.id);
  const metadonnees = {
    title: `${nutriment.nom} : efficacité, dangers et ce que disent les études | ScienceTruths`,
    description: descriptionGoogle(nutriment.nom, nbEtudes, nutriment.description),
    alternates: { canonical: adresse },
  };

    // Toute autre version filtrée : ne pas indexer, mais suivre les liens.
  // 10 nov. 2026 : fiche de moins de 3 études : pas d'indexation tant qu'elle reste trop pauvre
  // (elle redevient indexable d'elle-même dès qu'elle atteint 3 études).
  if (autresFiltres || sp.probleme || (nbEtudes !== null && nbEtudes < 3)) {
    metadonnees.robots = { index: false, follow: true };
  }
  return metadonnees;
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
