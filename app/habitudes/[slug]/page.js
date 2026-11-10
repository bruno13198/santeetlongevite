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

// Met en minuscule la première lettre d'un nom (« Performance sportive » → « performance sportive »),
// sauf pour les sigles (« SOPK » reste « SOPK »).
function enMinuscule(nom) {
  if (!nom || nom.length < 2 || nom[1] !== nom[1].toLowerCase()) return nom || '';
  return nom[0].toLowerCase() + nom.slice(1);
}

// Fiche d'une habitude alimentaire (régime, pratique).
// Titre et description pour Google (20 oct. 2026).
// 4 nov. 2026 : la fiche complète et la fiche filtrée par problème de santé peuvent apparaître
// dans Google, chacune avec son propre titre. Toutes les autres versions (niveau, tri, recherche,
// pages suivantes) sont interdites d'indexation, mais leurs liens restent suivis.
export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const { data: habitude } = await supabase
        .from('habitudes_alimentaires')
    .select('id, nom, description, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (!habitude || !habitude.actif) return { title: 'Régime introuvable | ScienceTruths' };

  const adresse = `https://sciencetruths.com/habitudes/${slug}`;
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
    const sujet = `${habitude.nom} : ${enMinuscule(probleme.nom)}`;
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
    .from('habitudes_etudes')
    .select('etude_id', { count: 'exact', head: true })
    .eq('habitude_id', habitude.id);
  const metadonnees = {
    title: `${habitude.nom} : efficacité, dangers et ce que disent les études | ScienceTruths`,
    description: descriptionGoogle(habitude.nom, nbEtudes, habitude.description),
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
