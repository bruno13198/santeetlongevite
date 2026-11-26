// Lien retour vers « L'étude de la semaine » (26 nov. 2026), affiché au-dessus des études des fiches
// et des pages de problème de santé. Au plus 3 numéros, les plus récents d'abord ; sur une fiche filtrée
// par problème de santé, les numéros de ce problème passent en premier. Au-delà, un lien vers la liste
// des numéros de la fiche. En cas d'erreur de lecture, rien ne s'affiche.
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const MAX_AFFICHES = 3;

function dateCourte(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// type : 'aliment', 'habitude', 'nutriment' ou 'probleme' ; chemin : adresse de la page (ex. /aliments/curcuma-poudre)
export default async function EtudesSemaineLiees({ type, chemin, probleme }) {
  const slug = (chemin || '').split('/').filter(Boolean).pop();
  if (!slug) return null;

  let requete = supabase
    .from('etudes_semaine')
    .select('slug, titre, date_parution, probleme_slug')
    .eq('publie', true)
    .order('date_parution', { ascending: false });
  requete = type === 'probleme' ? requete.eq('probleme_slug', slug) : requete.eq('fiche_type', type).eq('fiche_slug', slug);

  const { data, error } = await requete;
  if (error || !data || data.length === 0) return null;

  // Numéros du problème filtré en premier, puis les autres, chacun du plus récent au plus ancien.
  const numeros = probleme
    ? [...data.filter((n) => n.probleme_slug === probleme), ...data.filter((n) => n.probleme_slug !== probleme)]
    : data;
  const affiches = numeros.slice(0, MAX_AFFICHES);
  const reste = numeros.length - affiches.length;

  return (
    <div
      style={{
        margin: '8px 0 24px',
        padding: '12px 16px',
        border: '1px solid #c9d8bf',
        borderRadius: '8px',
        backgroundColor: '#f4f8ef',
        fontSize: '14px',
      }}
    >
      <strong style={{ display: 'block', marginBottom: '6px' }}>L'étude de la semaine</strong>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {affiches.map((n) => (
          <li key={n.slug} style={{ margin: '4px 0' }}>
            <span style={{ color: '#6B6E63' }}>{dateCourte(n.date_parution)} · </span>
            <Link href={`/etude-de-la-semaine/${n.slug}`} style={{ color: '#27500A' }}>
              {n.titre}
            </Link>
          </li>
        ))}
      </ul>
      {reste > 0 && type !== 'probleme' && (
        <Link
          href={`/etude-de-la-semaine?type=${type}&fiche=${slug}`}
          style={{ display: 'inline-block', marginTop: '6px', color: '#27500A' }}
        >
          Voir les {numeros.length} études de la semaine sur ce sujet →
        </Link>
      )}
      {reste > 0 && type === 'probleme' && (
        <Link href="/etude-de-la-semaine" style={{ display: 'inline-block', marginTop: '6px', color: '#27500A' }}>
          Voir tous les numéros →
        </Link>
      )}
    </div>
  );
}
