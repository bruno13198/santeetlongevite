import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
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

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function Home() {
  const { data: articles } = await supabase
    .from('articles')
    .select('titre, slug, created_at')
    .eq('publie', true)
    .neq('slug', 'Pourquoi-ce-site')
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: etudes } = await supabase
    .from('etudes')
    .select('id, titre_traduit, created_at')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(5);

  let etudesAvecLien = [];
  if (etudes && etudes.length > 0) {
    const etudeIds = etudes.map((e) => e.id);
    const { data: liaisons } = await supabase
      .from('aliments_etudes')
      .select('etude_id, aliment_id')
      .in('etude_id', etudeIds);

    const alimentIds = liaisons ? liaisons.map((l) => l.aliment_id) : [];
    const { data: alimentsData } = await supabase
      .from('aliments')
      .select('id, nom, slug')
      .in('id', alimentIds.length > 0 ? alimentIds : [0]);

    etudesAvecLien = etudes.map((etude) => {
      const liaison = liaisons?.find((l) => l.etude_id === etude.id);
      const aliment = liaison ? alimentsData?.find((a) => a.id === liaison.aliment_id) : null;
      return { ...etude, aliment };
    });
  }

  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>

        <p className={styles.eyebrow}>sciencetruths.com</p>
        <h1 className={styles.h1}>Comment fonctionne ce site</h1>

        <p className={styles.lede}>
          [Ton texte d'explication du fonctionnement du site — à rédiger. Deux ou trois
          paragraphes suffisent : ce que le visiteur va trouver, comment naviguer entre
          Articles et Veille scientifique, et ce qui distingue le site.]
        </p>

        <div className={styles.spectrum} role="img" aria-label="Spectre allant des promesses non prouvées aux preuves scientifiques solides">
          <div className={styles.spectrumTrack}>
            <span className={styles.spectrumFillHype} />
            <span className={styles.spectrumFillEvidence} />
          </div>
          <div className={styles.spectrumLabels}>
            <span className={styles.labelHype}>Promesses</span>
            <span className={styles.labelEvidence}>Preuves</span>
          </div>
        </div>

        <div className={styles.twoCol}>
          <section className={styles.col}>
            <p className={styles.tag} data-tone="evidence">Derniers articles</p>
            {(!articles || articles.length === 0) && (
              <p className={styles.empty}>Aucun article pour le moment.</p>
            )}
            <ul className={styles.itemList}>
              {articles?.map((article) => (
                <li key={article.slug}>
                  <Link href={`/articles/${article.slug}`} className={styles.itemLink}>
                    {article.titre}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.col}>
            <p className={styles.tag} data-tone="mono">Dernières études ajoutées</p>
            {etudesAvecLien.length === 0 && (
              <p className={styles.empty}>Aucune étude pour le moment.</p>
            )}
            <ul className={styles.itemList}>
              {etudesAvecLien.map((etude) => (
                <li key={etude.id}>
                  {etude.aliment ? (
                    <Link href={`/aliments/${etude.aliment.slug}`} className={styles.itemLink}>
                      {etude.titre_traduit}
                    </Link>
                  ) : (
                    <span className={styles.itemLink}>{etude.titre_traduit}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <Link href="/veille-scientifique" className={styles.cta}>
          Explorer la veille scientifique →
        </Link>

      </div>
    </main>
  );
}
