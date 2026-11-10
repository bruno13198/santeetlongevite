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

// Met en minuscule la première lettre d'un nom (« Performance sportive » → « performance sportive »),
// sauf pour les sigles (« SOPK » reste « SOPK »).
function enMinuscule(nom) {
  if (!nom || nom.length < 2 || nom[1] !== nom[1].toLowerCase()) return nom || '';
  return nom[0].toLowerCase() + nom.slice(1);
}

// Titre et description pour Google (20 oct. 2026). Le nom est raccourci à sa première partie.
// 4 nov. 2026 : la fiche complète et la fiche filtrée par problème de santé peuvent apparaître
// dans Google, chacune avec son propre titre. Toutes les autres versions (niveau, tri, recherche,
// pages suivantes) sont interdites d'indexation, mais leurs liens restent suivis.
export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const { data: aliment } = await supabase
        .from('aliments')
    .select('id, nom, description, actif')
    .eq('slug', slug)
    .maybeSingle();

  if (!aliment || !aliment.actif) return { title: 'Aliment introuvable | ScienceTruths' };

  const nomCourt = aliment.nom.split(', ')[0];
  const adresse = `https://sciencetruths.com/aliments/${slug}`;
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
    const sujet = `${nomCourt} : ${enMinuscule(probleme.nom)}`;
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
    return `${nom} : ${debut}. Bienfaits, dangers et niveau de preuve de chaque étude, résumés en français.`;
  }
  const { count: nbEtudes } = await supabase
    .from('aliments_etudes')
    .select('etude_id', { count: 'exact', head: true })
    .eq('aliment_id', aliment.id);
  const metadonnees = {
    title: `${nomCourt} : bienfaits, dangers et ce que disent les études | ScienceTruths`,
    description: descriptionGoogle(nomCourt, nbEtudes, aliment.description),
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
