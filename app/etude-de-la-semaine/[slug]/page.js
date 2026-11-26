// L'étude de la semaine : un numéro (26 nov. 2026).
// Visuel, texte (Markdown), bouton vers la fiche filtrée sur le problème de santé, référence complète
// de l'étude (lue dans la table etudes) et inscription aux alertes de la fiche.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Breadcrumbs from '../../components/Breadcrumbs';
import Disclaimer from '../../components/Disclaimer';
import SuivreSujet from '../../components/SuivreSujet';

export const revalidate = 3600;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SITE = 'https://sciencetruths.com';
const FICHES = {
  aliment: { table: 'aliments', prefixe: '/aliments' },
  habitude: { table: 'habitudes_alimentaires', prefixe: '/habitudes' },
  nutriment: { table: 'nutriments', prefixe: '/nutriments' },
};

async function lireNumero(slug) {
  const { data } = await supabase.from('etudes_semaine').select('*').eq('slug', slug).eq('publie', true).maybeSingle();
  return data || null;
}

function dateLisible(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Met en minuscule la première lettre d'un nom, sauf pour les sigles (« NAC » reste « NAC »).
function enMinuscule(nom) {
  if (!nom || nom.length < 2 || nom[1] !== nom[1].toLowerCase()) return nom || '';
  return nom[0].toLowerCase() + nom.slice(1);
}

// Référence au format Vancouver : auteurs. Titre. Revue. Année;Volume(Numéro):Pages.
function reference(e) {
  const auteurs = (e.auteurs || '').trim().replace(/\.$/, '');
  const titre = (e.titre_original || '').trim().replace(/\.$/, '');
  const revue = e.revue_abregee || e.revue || '';
  const annee = e.date_publication ? e.date_publication.slice(0, 4) : '';
  let detail = annee;
  if (e.volume) detail += `;${e.volume}`;
  if (e.numero) detail += `(${e.numero})`;
  if (e.pages) detail += `:${e.pages}`;
  return [auteurs, titre, revue, detail].filter(Boolean).join('. ') + '.';
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const numero = await lireNumero(slug);
  if (!numero) return { title: 'Étude de la semaine introuvable | ScienceTruths' };
  const adresse = `${SITE}/etude-de-la-semaine/${slug}`;
  const image = numero.visuel ? `${SITE}${numero.visuel}` : undefined;
  return {
    title: `${numero.titre} | L'étude de la semaine | ScienceTruths`,
    description: numero.chapo || undefined,
    alternates: { canonical: adresse },
    // Aperçu lors du partage sur LinkedIn et les autres réseaux
    openGraph: {
      type: 'article',
      url: adresse,
      title: numero.titre,
      description: numero.chapo || undefined,
      publishedTime: numero.date_parution,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function EtudeDeLaSemaine({ params }) {
  const { slug } = await params;
  const numero = await lireNumero(slug);
  if (!numero) notFound();

  // Fiche, problème de santé et étude présentée (chaque lecture est facultative)
  const fiche = FICHES[numero.fiche_type];
  const [{ data: sujet }, { data: probleme }, { data: etude }] = await Promise.all([
    fiche && numero.fiche_slug
      ? supabase.from(fiche.table).select('id, nom').eq('slug', numero.fiche_slug).maybeSingle()
      : Promise.resolve({ data: null }),
    numero.probleme_slug
      ? supabase.from('problemes_sante').select('nom').eq('slug', numero.probleme_slug).maybeSingle()
      : Promise.resolve({ data: null }),
    numero.etude_id
      ? supabase
          .from('etudes')
          .select('titre_original, auteurs, revue, revue_abregee, date_publication, volume, numero, pages, doi, url_originale, source_id')
          .eq('id', numero.etude_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Identifiant PubMed seulement s'il est numérique (Europe PMC donne aussi des identifiants PMC ou de prépublication)
  const pmid = etude && /^\d+$/.test(String(etude.source_id || '')) ? etude.source_id : null;

  const lienFiche =
    fiche && sujet
      ? `${fiche.prefixe}/${numero.fiche_slug}${numero.probleme_slug ? `?probleme=${numero.probleme_slug}` : ''}#etudes`
      : null;
  const libelleLien =
    numero.libelle_lien ||
    (sujet
      ? `Voir toutes les études sur ${enMinuscule(sujet.nom.split(', ')[0])}${probleme ? ` et ${enMinuscule(probleme.nom)}` : ''}`
      : null);

  const adresse = `${SITE}/etude-de-la-semaine/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: numero.titre,
    datePublished: numero.date_parution,
    ...(numero.visuel ? { image: `${SITE}${numero.visuel}` } : {}),
    author: { '@type': 'Organization', name: 'ScienceTruths' },
    publisher: { '@type': 'Organization', name: 'ScienceTruths' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': adresse },
  };

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.6' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: SITE },
          { nom: "L'étude de la semaine", url: `${SITE}/etude-de-la-semaine` },
          { nom: numero.titre, url: adresse },
        ]}
      />
      <Link href="/etude-de-la-semaine" style={{ color: '#555' }}>← Tous les numéros</Link>

      <p style={{ margin: '16px 0 0', fontSize: '14px', color: '#6B6E63' }}>
        L'étude de la semaine · {dateLisible(numero.date_parution)}
      </p>
      <h1 style={{ marginTop: '4px' }}>{numero.titre}</h1>
      {numero.chapo && <p style={{ fontSize: '17px', color: '#333' }}>{numero.chapo}</p>}

      {numero.visuel && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={numero.visuel}
          alt={numero.titre}
          width={1080}
          height={1350}
          style={{ width: '100%', height: 'auto', borderRadius: '8px', margin: '8px 0 24px' }}
        />
      )}

      {numero.contenu && (
        <div className="article-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {numero.contenu}
          </ReactMarkdown>
        </div>
      )}

      {lienFiche && (
        <p style={{ margin: '28px 0' }}>
          <Link
            href={lienFiche}
            style={{
              display: 'inline-block',
              padding: '12px 18px',
              backgroundColor: '#27500A',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            {libelleLien} →
          </Link>
        </p>
      )}

      {etude && (
        <section style={{ marginTop: '24px', fontSize: '14px' }}>
          <h2 style={{ fontSize: '16px' }}>Référence</h2>
          <p style={{ margin: '0 0 4px' }}>{reference(etude)}</p>
          <p style={{ margin: 0 }}>
            {etude.doi && (
              <>
                DOI : <a href={`https://doi.org/${etude.doi}`}>{etude.doi}</a>
              </>
            )}
            {etude.doi && pmid && ' · '}
            {pmid && (
              <>
                PubMed : <a href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}>{pmid}</a>
              </>
            )}
            {!etude.doi && !pmid && etude.url_originale && <a href={etude.url_originale}>Voir l'étude</a>}
          </p>
        </section>
      )}

      {sujet && (
        <div style={{ marginTop: '24px' }}>
          <SuivreSujet type={numero.fiche_type} sujetId={sujet.id} nom={sujet.nom} />
        </div>
      )}

      <Disclaimer />
    </main>
  );
}
