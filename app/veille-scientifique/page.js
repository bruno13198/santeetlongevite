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
  const [items, setItems] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    async function chargerDonnees() {
      const EXCEPTIONS_NOVA4 = ['isolat-de-soja', 'cola-sucre', 'lecithine-de-soja', 'kimchi', 'kombucha'];

      const [{ data: aliments, error: erreurAliments }, { data: habitudes, error: erreurHabitudes }] = await Promise.all([
        supabase.from('aliments').select('*').eq('actif', true).range(0, 3999),
        supabase.from('habitudes_alimentaires').select('*').eq('actif', true),
      ]);

      if (erreurAliments) {
        setErreur(erreurAliments.message);
        setChargement(false);
        return;
      }
      if (erreurHabitudes) {
        setErreur(erreurHabitudes.message);
        setChargement(false);
        return;
      }

      const alimentsFiltres = aliments
        .filter((a) => a.niveau_nova !== 4 || EXCEPTIONS_NOVA4.includes(a.slug))
        .map((a) => ({
          type: 'aliment',
          slug: a.slug,
          nom: a.nom,
          categorie: a.categorie,
          description: a.description,
        }));

      const habitudesFormatees = (habitudes || []).map((h) => ({
        type: 'habitude',
        slug: h.slug,
        nom: h.nom,
        categorie: 'Habitude alimentaire',
        description: h.description,
      }));

      setItems([...alimentsFiltres, ...habitudesFormatees]);
      setChargement(false);
    }
    chargerDonnees();
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

  const itemsFiltres = items.filter((item) => {
    if (motsRecherche.length === 0) return false;
    const motsDuNom = normaliser(item.nom).split(/[^a-z0-9]+/).filter((m) => m !== '');
    return motsRecherche.every((motRecherche) => {
      if (motRecherche.length <= 3) {
        return motsDuNom.some((mot) => mot === motRecherche);
      }
      const motRechercheSing = singulariser(motRecherche);
      return motsDuNom.some((mot) => {
        if (mot.length <= 3) return false;
        const motSing = singulariser(mot);
        return motSing.startsWith(motRechercheSing) || motRechercheSing.startsWith(motSing);
      });
    });
  });

  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>

        <p className={styles.eyebrow}>sciencetruths.com</p>
        <h1 className={styles.h1}>Veille scientifique</h1>
        <p className={styles.lede}>
          Recherchez un aliment ou une habitude alimentaire (régime méditerranéen, jeûne intermittent...) pour consulter les études scientifiques qui lui sont associées.
        </p>

        <input
          type="text"
          placeholder="Rechercher un aliment ou un régime (ex : curcuma, jeûne)..."
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className={styles.input}
        />

        {erreur && <p className={styles.error}>Erreur : {erreur}</p>}
        {chargement && <p className={styles.empty}>Chargement...</p>}
        {!chargement && recherche !== '' && itemsFiltres.length === 0 && (
          <p className={styles.empty}>Aucun résultat trouvé pour « {recherche} ».</p>
        )}

        <ul className={styles.resultList}>
          {itemsFiltres.map((item) => (
            <li key={`${item.type}-${item.slug}`} className={styles.resultItem}>
              <Link href={`/${item.type === 'habitude' ? 'habitudes' : 'aliments'}/${item.slug}`} className={styles.resultLink}>
                <strong className={styles.resultNom}>{item.nom.split(',')[0]}</strong>
                {item.nom.includes(',') && (
                  <span className={styles.resultDetail}>
                    {' '}({item.nom.split(',').slice(1).join(',').trim()})
                  </span>
                )}
                <span className={styles.resultCategorie}> — {item.categorie}</span>
                <br />
                <span className={styles.resultDescription}>{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>

      </div>
    </main>
  );
}
