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

// Couleurs des niveaux de preuve Oxford, identiques à celles des fiches aliments.
const COULEURS_NIVEAUX = {
  1: { fond: '#C0DD97', texte: '#173404' },
  2: { fond: '#EAF3DE', texte: '#27500A' },
  3: { fond: '#FAEEDA', texte: '#633806' },
  4: { fond: '#FAECE7', texte: '#712B13' },
  5: { fond: '#E4E9EE', texte: '#34495E' },
};

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
    .select('id, titre_traduit, created_at, niveau_preuve, design_etude')
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
          ScienceTruths vous tient informé des recherches les plus récentes sur la santé, en
          commençant par la nutrition, puis le sport et le sommeil. Le site est encore en
          construction, mais vous pouvez déjà découvrir :
        </p>

        <div className={styles.intro}>
          <p className={styles.introItem}>
            <strong>Les articles</strong> — Des synthèses accessibles et documentées sur les
            aliments, fondées sur l'ensemble des données scientifiques disponibles.
          </p>
          <p className={styles.introItem}>
            <strong>La veille scientifique</strong> — Elle fonctionne déjà pour les aliments et
            les habitudes alimentaires (régime méditerranéen, jeûne intermittent, régime
            cétogène…). Chaque semaine, nous recensons les nouvelles études menées chez l'humain,
            et chacune reçoit un <Link href="/niveaux-de-preuve">niveau de preuve</Link>, de 1
            (le plus solide) à 5, selon l'échelle internationale du Centre for Evidence-Based
            Medicine de l'université d'Oxford, pour que vous sachiez d'un coup d'œil ce
            qu'elle vaut vraiment.
            Nous réfléchissons à l'étendre au sport, avant le sommeil et peut-être les compléments
            alimentaires.
          </p>
          <p className={styles.introItem}>
            <strong>Des alertes personnalisées</strong> — Recevez par e-mail les nouvelles
            recherches sur les sujets que vous avez choisis.
          </p>
        </div>

        <p className={styles.lede}>Prochainement :</p>

        <div className={styles.intro}>
          <p className={styles.introItem}>
            <strong>Des outils pratiques</strong> — Calculateurs, évaluations et outils autour
            de la nutrition, de l'activité physique et de la longévité.
          </p>
          <p className={styles.introItem}>
            <strong>Une base scientifique toujours plus complète</strong> — Retrouver et
            explorer facilement toutes les études utilisées par la veille et les articles.
            L'objectif : comprendre les connaissances actuelles, suivre leur évolution et pouvoir
            les utiliser concrètement au quotidien.
          </p>
        </div>

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
              {etudesAvecLien.map((etude) => {
                const couleurs = COULEURS_NIVEAUX[etude.niveau_preuve];
                return (
                  <li key={etude.id}>
                    {couleurs && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginBottom: '4px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: couleurs.fond,
                          color: couleurs.texte,
                        }}
                      >
                        Niveau {etude.niveau_preuve}
                        {etude.design_etude ? ` — ${etude.design_etude}` : ''}
                      </span>
                    )}
                    {etude.aliment ? (
                      <Link href={`/aliments/${etude.aliment.slug}`} className={styles.itemLink}>
                        {etude.titre_traduit}
                      </Link>
                    ) : (
                      <span className={styles.itemLink}>{etude.titre_traduit}</span>
                    )}
                  </li>
                );
              })}
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
