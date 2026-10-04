// Page « Veille scientifique » (refonte du 4 oct. 2026).
// Composant serveur : la liste complète des aliments et des habitudes est chargée ici
// et rendue dans le HTML (liens vers les fiches visibles par les moteurs de recherche).
// L'interaction (onglets, recherche, cases d'alerte, bandeau d'inscription) est gérée
// par le composant client VeilleNavigateur.

import { createClient } from '@supabase/supabase-js';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import VeilleNavigateur from '../components/VeilleNavigateur';
import styles from './page.module.css';

// La liste est régénérée au plus toutes les heures.
export const revalidate = 3600;

export const metadata = {
  title: 'Veille scientifique : aliments et régimes | ScienceTruths',
  description:
    "Tous les aliments et régimes suivis par ScienceTruths, avec les études scientifiques associées. Recevez par e-mail les nouvelles études sur les sujets qui vous intéressent.",
};

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

async function chargerSujets() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const [{ data: aliments, error: erreurAliments }, { data: habitudes, error: erreurHabitudes }] =
    await Promise.all([
      supabase.from('aliments').select('id, slug, nom').eq('actif', true).range(0, 3999),
      supabase.from('habitudes_alimentaires').select('id, slug, nom').eq('actif', true),
    ]);

  if (erreurAliments || erreurHabitudes) {
    return { erreur: (erreurAliments || erreurHabitudes).message, aliments: [], habitudes: [] };
  }

  return {
    erreur: null,
    // 4 oct. 2026 : plus de filtre NOVA 4, la colonne actif est le seul interrupteur.
    aliments: (aliments || []).map((a) => ({ id: a.id, slug: a.slug, nom: a.nom })),
    habitudes: (habitudes || []).map((h) => ({ id: h.id, slug: h.slug, nom: h.nom })),
  };
}

export default async function VeilleScientifique() {
  const { erreur, aliments, habitudes } = await chargerSujets();

  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>
        <p className={styles.eyebrow}>sciencetruths.com</p>
        <h1 className={styles.h1}>Veille scientifique</h1>
        <p className={styles.lede}>
          Tous les aliments et régimes que nous suivons. Cliquez sur un nom pour voir les études
          associées. Cochez ceux qui vous intéressent pour recevoir les nouvelles études par e-mail,
          une fois par semaine.
        </p>

        {erreur ? (
          <p className={styles.error}>La liste n'a pas pu être chargée. Rechargez la page dans quelques instants.</p>
        ) : (
          <VeilleNavigateur aliments={aliments} habitudes={habitudes} />
        )}
      </div>
    </main>
  );
}
