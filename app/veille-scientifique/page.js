'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import styles from './page.module.css';

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function VeilleScientifique() {
  const [aliments, setAliments] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    async function chargerAliments() {
      const EXCEPTIONS_NOVA4 = ['isolat-de-soja', 'cola-sucre', 'lecithine-de-soja', 'kimchi', 'kombucha'];
      const { data, error } = await supabase
        .from('aliments')
        .select('*')
        .eq('actif', true)
        .range(0, 3999);
      if (error) {
        setErreur(error.message);
      } else {
        const filtres = data.filter(
          (a) => a.niveau_nova !== 4 || EXCEPTIONS_NOVA4.includes(a.slug)
        );
        setAliments(filtres);
      }
      setChargement(false);
    }
    chargerAliments();
  }, []);

  function normaliser(texte) {
    return texte
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

 function singulariser(mot) {
    return mot.endsWith('s') && mot.length > 4 ? mot.slice(0, -1) : mot;
  }

  const rechercheNorm = normaliser(recherche);
  const motsRecherche = rechercheNorm.split(/[^a-z0-9]+/).filter((m) => m !== '');

  const alimentsFiltres = aliments.filter((aliment) => {
    if (motsRecherche.length === 0) return false;
    const motsDuNom = normaliser(aliment.nom).split(/[^a-z0-9]+/).filter((m) => m !== '');
    return motsRecherche.every((motRecherche) => {
      if (motRecherche.length <= 3) {
        return motsDuNom.some((mot) => mot === motRecherche);
      }
      const motRechercheSing = singulariser(motRecherche);
      return motsDuNom.some((mot) => {
        const motSing = singulariser(mot);
        return motSing.startsWith(motRechercheSing) || motRechercheSing.startsWith(motSing);
      });
    });
  });;

  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>

        <p className={styles.eyebrow}>sciencetruths.com</p>
        <h1 className={styles.h1}>Veille scientifique</h1>
        <p className={styles.lede}>
          Recherchez un aliment pour consulter les études scientifiques qui lui sont associées.
        </p>

        <input
          type="text"
          placeholder="Rechercher un aliment (ex : curcuma)..."
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className={styles.input}
        />

        {erreur && <p className={styles.error}>Erreur : {erreur}</p>}
        {chargement && <p className={styles.empty}>Chargement...</p>}
        {!chargement && recherche !== '' && alimentsFiltres.length === 0 && (
          <p className={styles.empty}>Aucun aliment trouvé pour « {recherche} ».</p>
        )}

        <ul className={styles.resultList}>
          {alimentsFiltres.map((aliment) => (
            <li key={aliment.id} className={styles.resultItem}>
              <Link href={`/aliments/${aliment.slug}`} className={styles.resultLink}>
                <strong className={styles.resultNom}>{aliment.nom.split(',')[0]}</strong>
                {aliment.nom.includes(',') && (
                  <span className={styles.resultDetail}>
                    {' '}({aliment.nom.split(',').slice(1).join(',').trim()})
                  </span>
                )}
                <span className={styles.resultCategorie}> — {aliment.categorie}</span>
                <br />
                <span className={styles.resultDescription}>{aliment.description}</span>
              </Link>
            </li>
          ))}
        </ul>

      </div>
    </main>
  );
}
