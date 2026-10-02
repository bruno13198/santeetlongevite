import Link from 'next/link';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import styles from './page.module.css';
import RelectureForm from '../components/RelectureForm';

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

export const metadata = {
  title: 'À propos — ScienceTruths',
  description:
    "Comment ScienceTruths sélectionne, résume et évalue les études scientifiques sur la nutrition : niveaux de preuve d'Oxford, grades GRADE et usage transparent de l'intelligence artificielle.",
  alternates: { canonical: 'https://sciencetruths.com/a-propos' },
};

export default function APropos() {
  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>

        <p className={styles.eyebrow}>ScienceTruths — À propos</p>
        <h1 className={styles.h1}>La science de la santé, sans le bruit autour</h1>

        <p className={styles.lede}>
          Un aliment devient un « super-aliment ». Une molécule est présentée comme
          révolutionnaire. Une étude fait la une et semble, à elle seule, remettre en cause tout
          ce que l'on croyait savoir.
        </p>
        <p className={styles.lede}>
          La recherche est rarement aussi simple. Une étude n'est pas une vérité. Un résultat
          intéressant n'est pas un effet démontré. Et l'absence de preuve n'est pas la preuve de
          l'absence.
        </p>

        {/* --- Élément signature : le spectre preuve / promesse --- */}
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

        <p className={styles.lede}>
          ScienceTruths est né d'une idée simple&nbsp;: permettre à chacun de revenir aux données
          scientifiques elles-mêmes, sans avoir à lire des milliers de publications, pour
          comprendre ce qui aide réellement à vivre longtemps en bonne santé.
        </p>

        {/* --- Ce que propose le site --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Ce que propose le site</p>
          <p className={styles.body}>
            Le site commence par la nutrition. Le sport et le sommeil suivront, puis la longévité
            au sens large&nbsp;: ce sont les grands facteurs de mode de vie, et ils agissent les
            uns sur les autres.
          </p>
          <p className={styles.body}>
            <strong>Les articles</strong> font, aliment par aliment, la synthèse de toutes les
            études disponibles. Chaque conclusion reçoit un grade de A à D selon GRADE, le système
            international utilisé par l'OMS et Cochrane pour évaluer la solidité d'un ensemble de
            preuves.
          </p>
          <p className={styles.body}>
            <strong>La veille scientifique</strong> recense chaque semaine les nouvelles études
            menées chez l'humain. Chacune est résumée en français et classée selon son{' '}
            <Link href="/niveaux-de-preuve">niveau de preuve</Link>, de 1 à 5, sur l'échelle du
            Centre for Evidence-Based Medicine de l'université d'Oxford. Car une étude sur
            quelques volontaires ne pèse pas autant qu'une méta-analyse de dizaines d'essais.
          </p>
          <p className={styles.body}>
            <strong>Les alertes</strong> vous préviennent par e-mail des nouvelles études sur les
            sujets que vous suivez.
          </p>
          <p className={styles.body}>
            Vous pouvez partir d'un article, consulter les études sur lesquelles il repose, puis
            remonter jusqu'à la publication originale. Pas besoin de nous croire sur parole.
          </p>
        </section>

        {/* --- Nos questions --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Nos questions, pour chaque sujet</p>
          <p className={styles.body}>
            Que sait-on réellement&nbsp;? Quel est le niveau de preuve&nbsp;? Les études
            concordent-elles&nbsp;? Les effets observés chez l'humain sont-ils importants&nbsp;?
            Existe-t-il des risques&nbsp;? Et surtout&nbsp;: que ne peut-on pas encore
            affirmer&nbsp;?
          </p>
          <p className={styles.body}>Quand la science ne sait pas, nous le disons.</p>
          <p className={styles.pullQuote}>« Les preuves sont insuffisantes. »</p>
          <p className={styles.body}>
            vaut mieux qu'une réponse artificiellement certaine. Reconnaître l'incertitude n'est
            pas une faiblesse de la science, c'est l'une de ses forces.
          </p>
        </section>

        {/* --- Le rôle de l'IA --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">L'intelligence artificielle, un outil</p>
          <p className={styles.body}>
            Pour traiter des milliers de publications, nous nous appuyons sur l'intelligence
            artificielle. Elle repère les études pertinentes, rédige les résumés de la veille et
            propose leur niveau de preuve, selon des règles fixes et identiques pour toutes. Ces
            résumés sont produits automatiquement, à partir des résumés des études&nbsp;: ils
            peuvent contenir des erreurs, et chacun renvoie vers sa source pour que vous puissiez
            vérifier.
          </p>
          <p className={styles.body}>
            Les articles sont rédigés avec cette assistance, puis relus et validés avant
            publication.
          </p>
          <p className={styles.body}>
            L'IA n'est pas la source de l'information&nbsp;: la source reste la publication
            scientifique. Si vous repérez une erreur, une imprécision ou une source manquante,
            écrivez-nous à{' '}
            <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>.
          </p>
        </section>

        {/* --- Recherche relecteur scientifique --- */}
        <section id="relecture-scientifique" className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Nous recherchons un professionnel de santé</p>
          <p className={styles.body}>
            Pour renforcer notre démarche, nous cherchons un médecin, pharmacien, chercheur ou
            autre professionnel de santé (nutrition, médecine préventive, physiologie, sport ou
            longévité) pour relire ponctuellement nos articles&nbsp;: signaler les erreurs, les
            formulations excessives, les interprétations discutables ou les références
            manquantes.
          </p>
          <p className={styles.body}>
            Quelques heures de relecture de temps en temps, sans engagement lourd. La
            collaboration est bénévole dans un premier temps, et la décision éditoriale finale
            reste indépendante. Aucune affiliation ou partenariat avec une marque de compléments
            alimentaires ne doit influencer la relecture.
          </p>

          <div style={{ marginTop: '32px' }}>
            <RelectureForm />
          </div>
        </section>

        {/* --- Engagement / manifeste --- */}
        <section className={styles.manifesto}>
          <p className={styles.tag} data-tone="evidence">Notre objectif</p>
          <p className={styles.body}>
            Nous ne voulons pas vous dire quoi penser. Nous voulons vous donner les moyens de
            comprendre ce que la science sait, ce qu'elle suggère et ce qu'elle ignore encore,
            pour prendre des décisions éclairées à partir des meilleures preuves disponibles.
          </p>
          <p className={styles.pullQuote}>Moins de promesses. Plus de preuves.</p>
        </section>

      </div>
    </main>
    );
}
