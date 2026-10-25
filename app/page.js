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

// 22 oct. 2026 : adresse canonique de la page d'accueil (le titre reste celui du layout).
const ADRESSE_SITE = 'https:' + '//sciencetruths.com';
export const metadata = {
  alternates: { canonical: ADRESSE_SITE },
};

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

// Pour chaque étude, cherche une fiche à laquelle elle est reliée et renvoie son lien.
// 18 oct. 2026 : aliments, puis régimes et habitudes, puis nutriments (avant : aliments seulement).
async function chercherLiens(etudeIds) {
  const sources = [
    { liaison: 'aliments_etudes', cle: 'aliment_id', table: 'aliments', prefixe: '/aliments' },
    { liaison: 'habitudes_etudes', cle: 'habitude_id', table: 'habitudes_alimentaires', prefixe: '/habitudes' },
    { liaison: 'nutriments_etudes', cle: 'nutriment_id', table: 'nutriments', prefixe: '/nutriments' },
  ];
  const liens = {};

  for (const source of sources) {
    const restantes = etudeIds.filter((id) => !liens[id]);
    if (restantes.length === 0) break;

    const { data: liaisons } = await supabase
      .from(source.liaison)
      .select(`etude_id, ${source.cle}`)
      .in('etude_id', restantes);
    if (!liaisons || liaisons.length === 0) continue;

    const sujetIds = [...new Set(liaisons.map((l) => l[source.cle]))];
    const { data: sujets } = await supabase
      .from(source.table)
      .select('id, slug, actif')
      .in('id', sujetIds);

    for (const l of liaisons) {
      if (liens[l.etude_id]) continue;
      const sujet = sujets?.find((s) => s.id === l[source.cle] && s.actif);
      if (sujet) liens[l.etude_id] = `${source.prefixe}/${sujet.slug}`;
    }
  }
  return liens;
}

// 25 oct. 2026 : chiffres clés affichés sous le titre, calculés à partir de la base et arrondis
// vers le bas (« plus de 7 800 » plutôt que « 7 853 »), pour être lisibles et toujours vrais.
function arrondirVersLeBas(nombre, pas) {
  return Math.floor((nombre || 0) / pas) * pas;
}

async function compter(table, filtreActif = true) {
  let requete = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filtreActif) requete = requete.eq('actif', true);
  const { count } = await requete;
  return count || 0;
}

export default async function Home() {
  const [nbEtudes, nbAliments, nbHabitudes, nbNutriments, nbProblemes] = await Promise.all([
    compter('etudes', false),
    compter('aliments'),
    compter('habitudes_alimentaires'),
    compter('nutriments'),
    compter('problemes_sante'),
  ]);
  const nbSujets = nbAliments + nbHabitudes + nbNutriments;
  const formater = (n) => n.toLocaleString('fr-FR');

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
    const liens = await chercherLiens(etudes.map((e) => e.id));
    etudesAvecLien = etudes.map((etude) => ({ ...etude, lien: liens[etude.id] || null }));
  }

  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>

        <p className={styles.eyebrow}>sciencetruths.com</p>
        <h1 className={styles.h1}>Comment fonctionne ce site</h1>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: '#27500A', margin: '-4px 0 20px', lineHeight: 1.6 }}>
          Plus de {formater(arrondirVersLeBas(nbEtudes, 100))} études
          {' · '}plus de {formater(arrondirVersLeBas(nbSujets, 50))} sujets suivis
          {' · '}{nbProblemes} problèmes de santé
          {' · '}mise à jour chaque lundi
        </p>

        <p className={styles.lede}>
          ScienceTruths vous tient informé des recherches les plus récentes sur la santé. Le volet
          nutrition est aujourd'hui presque complet ; le sport et le sommeil viendront ensuite. Vous
          y trouverez :
        </p>

        <div className={styles.intro}>
          <p className={styles.introItem}>
            <strong>Les articles</strong> — Des synthèses accessibles et documentées sur les
            aliments, les régimes et les compléments, fondées sur l'ensemble des données
            scientifiques disponibles.
          </p>
          <p className={styles.introItem}>
            <strong>La veille scientifique</strong> — Elle couvre les aliments, les régimes et
            habitudes alimentaires (régime méditerranéen, jeûne intermittent, régime cétogène…),
            les nutriments, compléments alimentaires et plantes (vitamine D, magnésium, créatine,
            curcuma, ashwagandha…), ainsi que les additifs et contaminants alimentaires
            (édulcorants, nitrites, émulsifiants, mercure, acrylamide…). Chaque lundi, nous
            ajoutons les nouvelles études menées chez l'homme. Chacune reçoit un{' '}
            <Link href="/niveaux-de-preuve">niveau de preuve</Link>, de 1 (le plus solide) à 5,
            selon l'échelle internationale du Centre for Evidence-Based Medicine de l'université
            d'Oxford, pour que vous sachiez d'un coup d'œil ce qu'elle vaut vraiment.
          </p>
          <p className={styles.introItem}>
            <strong>Les problèmes de santé</strong> — Diabète, hypertension, dépression,
            grossesse… Pour chacun, retrouvez{' '}
            <Link href="/sante">toutes les études qui le concernent</Link>, et les aliments,
            régimes et compléments les plus étudiés.
          </p>
          <p className={styles.introItem}>
            <strong>Des alertes personnalisées</strong> — Recevez chaque lundi par e-mail les
            nouvelles études sur les sujets que vous avez choisis. Sans compte ni mot de passe :
            votre adresse ne sert qu'à vous envoyer ces alertes, elle n'est jamais revendue ni
            utilisée à d'autres fins, et chaque e-mail contient un lien pour vous désabonner en un
            clic.
          </p>
        </div>

        <p className={styles.lede}>Prochainement :</p>

        <div className={styles.intro}>
          <p className={styles.introItem}>
            <strong>Le sport, puis le sommeil</strong> — La veille scientifique s'étendra à ces
            deux domaines, avec la même méthode.
          </p>
          <p className={styles.introItem}>
            <strong>Une base scientifique toujours plus complète</strong> — Retrouver et
            explorer facilement toutes les études utilisées par la veille et les articles.
            L'objectif : comprendre l'état actuel des connaissances, suivre leur évolution et
            pouvoir s'en servir au quotidien.
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
                    {etude.lien ? (
                      <Link href={etude.lien} className={styles.itemLink}>
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
