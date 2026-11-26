// L'étude de la semaine : liste des numéros (26 nov. 2026).
// Chaque lundi, une étude marquante de la veille, présentée pour les professionnels.
// Paramètres facultatifs ?type=aliment&fiche=curcuma-poudre : seulement les numéros d'une fiche
// (lien « Voir les N études de la semaine » des fiches). Ces versions filtrées ne sont pas indexées.
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Breadcrumbs from '../components/Breadcrumbs';

export const revalidate = 3600;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ADRESSE = 'https://sciencetruths.com/etude-de-la-semaine';
const TABLES_FICHES = { aliment: 'aliments', habitude: 'habitudes_alimentaires', nutriment: 'nutriments' };

function lireFiltre(sp) {
  const type = typeof sp?.type === 'string' && TABLES_FICHES[sp.type] ? sp.type : null;
  const fiche = typeof sp?.fiche === 'string' ? sp.fiche.slice(0, 200) : null;
  return type && fiche ? { type, fiche } : null;
}

function dateLisible(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function generateMetadata({ searchParams }) {
  const filtre = lireFiltre(await searchParams);
  return {
    title: "L'étude de la semaine : une étude scientifique marquante, décryptée chaque lundi | ScienceTruths",
    description:
      "Chaque lundi, une étude marquante de la veille scientifique en nutrition, présentée pour les professionnels de santé : résultats chiffrés, limites et mise en perspective.",
    alternates: { canonical: ADRESSE },
    ...(filtre ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function EtudesDeLaSemaine({ searchParams }) {
  const filtre = lireFiltre(await searchParams);

  let requete = supabase
    .from('etudes_semaine')
    .select('slug, titre, date_parution, chapo, visuel')
    .eq('publie', true)
    .order('date_parution', { ascending: false });
  if (filtre) requete = requete.eq('fiche_type', filtre.type).eq('fiche_slug', filtre.fiche);
  const { data: numeros } = await requete;

  let nomFiche = null;
  if (filtre) {
    const { data } = await supabase.from(TABLES_FICHES[filtre.type]).select('nom').eq('slug', filtre.fiche).maybeSingle();
    nomFiche = data?.nom || null;
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.6' }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: "L'étude de la semaine", url: ADRESSE },
        ]}
      />
      <h1 style={{ marginTop: '16px' }}>
        {nomFiche ? `L'étude de la semaine : ${nomFiche}` : "L'étude de la semaine"}
      </h1>
      {filtre ? (
        <p>
          <Link href="/etude-de-la-semaine">← Voir tous les numéros</Link>
        </p>
      ) : (
        <p style={{ color: '#444' }}>
          Chaque lundi, une étude marquante parmi celles ajoutées par la veille scientifique, présentée pour les
          professionnels : ce qui a été testé, les résultats chiffrés, les limites, et ce qu'elle change par rapport
          aux études précédentes.
        </p>
      )}

      {!numeros || numeros.length === 0 ? (
        <p style={{ color: '#6B6E63' }}>Aucun numéro pour le moment.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0' }}>
          {numeros.map((n) => (
            <li key={n.slug} style={{ borderTop: '1px solid #eee', padding: '20px 0' }}>
              <Link
                href={`/etude-de-la-semaine/${n.slug}`}
                style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}
              >
                {n.visuel && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.visuel}
                    alt=""
                    width={96}
                    height={120}
                    loading="lazy"
                    style={{ objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                  />
                )}
                <span>
                  <span style={{ display: 'block', fontSize: '13px', color: '#6B6E63' }}>{dateLisible(n.date_parution)}</span>
                  <strong style={{ display: 'block', fontSize: '17px', color: '#27500A', margin: '2px 0 4px' }}>{n.titre}</strong>
                  {n.chapo && <span style={{ display: 'block', fontSize: '14px', color: '#333' }}>{n.chapo}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
