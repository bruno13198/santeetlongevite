// Page « Problèmes de santé » (21 oct. 2026) : les problèmes de santé de la table problemes_sante,
// rangés par famille, avec le nombre d'études de chacun. Chaque nom mène à sa page /sante/[slug].
// 22 oct. 2026 : cases à cocher pour s'abonner aux alertes (composant ListeProblemes).
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Breadcrumbs from '../components/Breadcrumbs';
import Disclaimer from '../components/Disclaimer';
import ListeProblemes from '../components/ListeProblemes';

export const revalidate = 3600;

export const metadata = {
  title: 'Alimentation et santé : les études par problème de santé | ScienceTruths',
  description:
    "Diabète, hypertension, dépression, cancer, grossesse… Toutes les études scientifiques de notre veille, classées par problème de santé et par niveau de preuve.",
  alternates: { canonical: 'https://sciencetruths.com/sante' },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function PageSante() {
  const [{ data: problemes }, { data: comptes }] = await Promise.all([
    supabase.from('problemes_sante').select('id, slug, nom, famille, ordre').eq('actif', true).order('ordre'),
    supabase.from('nb_etudes_par_probleme').select('probleme_id, nb'),
  ]);

  const nbParProbleme = new Map((comptes || []).map((c) => [c.probleme_id, Number(c.nb)]));

  // Regroupement par famille, dans l'ordre de la liste
  const familles = [];
  for (const p of problemes || []) {
    let famille = familles.find((f) => f.nom === p.famille);
    if (!famille) {
      famille = { nom: p.famille, problemes: [] };
      familles.push(famille);
    }
    famille.problemes.push({ ...p, nb: nbParProbleme.get(p.id) || 0 });
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '760px', margin: '0 auto', lineHeight: 1.5 }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Problèmes de santé', url: 'https://sciencetruths.com/sante' },
        ]}
      />

      <h1 style={{ marginTop: '16px' }}>Problèmes de santé</h1>
      <p>
        Toutes les études de notre veille scientifique, rangées par problème de santé. Pour chacun, vous
        trouverez les aliments, régimes et compléments les plus étudiés, et toutes les études classées par
        niveau de preuve. Les nouvelles études sont ajoutées chaque lundi.
      </p>

      {/* 22 oct. 2026 : cases à cocher pour s'abonner aux alertes */}
      <ListeProblemes familles={familles} />

      <Disclaimer />
    </main>
  );
}
