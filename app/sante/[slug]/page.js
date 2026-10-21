// Page d'un problème de santé (21 oct. 2026).
// Sous-onglets par domaine (Nutrition, puis Sport et Sommeil quand ces veilles existeront) :
// seuls les domaines actifs sont affichés. Dans l'onglet Nutrition : les sujets les plus étudiés
// pour ce problème, puis toutes les études (pagination côté serveur, comme les fiches).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Breadcrumbs from '../../components/Breadcrumbs';
import Disclaimer from '../../components/Disclaimer';
import SectionEtudes from '../../components/SectionEtudes';

export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Domaines de la veille. Passer actif à true quand la veille sport ou sommeil existera.
const DOMAINES = [
  { cle: 'nutrition', libelle: 'Nutrition', actif: true },
  { cle: 'sport', libelle: 'Sport', actif: false },
  { cle: 'sommeil', libelle: 'Sommeil', actif: false },
];

const PREFIXES = { aliment: '/aliments', habitude: '/habitudes', nutriment: '/nutriments' };
const LIBELLES_TYPES = {
  aliment: 'Aliment',
  habitude: 'Régime ou habitude',
  nutriment: 'Nutriment ou complément',
};

// Problèmes sensibles : message d'orientation affiché en haut de la page.
const MESSAGES_SENSIBLES = {
  'troubles-comportement-alimentaire':
    "Si vous êtes concerné, vous n'êtes pas seul : parlez-en à votre médecin, qui pourra vous orienter vers une équipe spécialisée. Les études présentées ici s'adressent d'abord aux professionnels et ne remplacent pas un accompagnement.",
};

async function chargerProbleme(slug) {
  const { data } = await supabase
    .from('problemes_sante')
    .select('id, slug, nom, famille, actif')
    .eq('slug', slug)
    .maybeSingle();
  return data && data.actif ? data : null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const probleme = await chargerProbleme(slug);
  if (!probleme) return { title: 'Problème de santé introuvable | ScienceTruths' };
  return {
    title: `${probleme.nom} et alimentation : ce que disent les études | ScienceTruths`,
    description: `Aliments, régimes et compléments : toutes les études scientifiques sur ${probleme.nom.toLowerCase()}, résumées en français et classées par niveau de preuve.`,
    alternates: { canonical: `https://sciencetruths.com/sante/${slug}` },
  };
}

export default async function PageProbleme({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const probleme = await chargerProbleme(slug);
  if (!probleme) notFound();

  const { data: sujets } = await supabase.rpc('sujets_par_probleme', { p_probleme: probleme.id, p_limite: 15 });
  const domainesActifs = DOMAINES.filter((d) => d.actif);

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Problèmes de santé', url: 'https://sciencetruths.com/sante' },
          { nom: probleme.nom, url: `https://sciencetruths.com/sante/${slug}` },
        ]}
      />

      <Link href="/sante" style={{ color: '#555' }}>← Tous les problèmes de santé</Link>

      <h1 style={{ marginTop: '16px' }}>{probleme.nom}</h1>
      <p style={{ color: '#6B6E63', marginTop: '-8px' }}>{probleme.famille}</p>

      {MESSAGES_SENSIBLES[slug] && (
        <p style={{ padding: '12px 16px', backgroundColor: '#EEF2E8', borderRadius: '8px', fontSize: '14px' }}>
          {MESSAGES_SENSIBLES[slug]}
        </p>
      )}

      {/* Sous-onglets par domaine (un seul tant que la veille ne couvre que la nutrition) */}
      <div role="tablist" aria-label="Domaine" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #ddd', margin: '20px 0' }}>
        {domainesActifs.map((d) => (
          <span
            key={d.cle}
            role="tab"
            aria-selected={d.cle === 'nutrition'}
            style={{
              padding: '8px 14px',
              fontWeight: 600,
              borderBottom: d.cle === 'nutrition' ? '3px solid #27500A' : '3px solid transparent',
              color: d.cle === 'nutrition' ? '#27500A' : '#555',
            }}
          >
            {d.libelle}
          </span>
        ))}
      </div>

      {sujets && sujets.length > 0 && (
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '18px' }}>Les sujets les plus étudiés</h2>
          <p style={{ color: '#6B6E63', fontSize: '14px', marginTop: '-6px' }}>
            Aliments, régimes et compléments qui comptent le plus d'études sur ce problème de santé.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {sujets.map((s) => (
              <li key={`${s.type}-${s.slug}`} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Link href={`${PREFIXES[s.type]}/${s.slug}`} style={{ color: '#27500A' }}>
                  {s.nom}
                </Link>
                <span style={{ color: '#6B6E63', fontSize: '13px' }}>
                  {' '}· {LIBELLES_TYPES[s.type]} · {s.nb} étude{Number(s.nb) > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SectionEtudes type="probleme" sujetId={probleme.id} chemin={`/sante/${slug}`} searchParams={sp} />

      <Disclaimer />
    </main>
  );
}
