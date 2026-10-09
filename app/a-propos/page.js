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
    "Qui fait ScienceTruths, d'où viennent les études, comment elles sont évaluées, le rôle de l'intelligence artificielle, les limites du site et son financement.",
  alternates: { canonical: 'https://sciencetruths.com/a-propos' },
};

export default function APropos() {
  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>

        <p className={styles.eyebrow}>ScienceTruths — À propos</p>
        <h1 className={styles.h1}>Comment fonctionne ce site</h1>

        <p className={styles.lede}>
          Cette page explique qui fait ScienceTruths, d'où viennent les informations publiées,
          comment elles sont évaluées et quelles sont leurs limites.
        </p>

        {/* --- Qui fait le site --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Qui fait le site</p>
          <p className={styles.body}>
            ScienceTruths est un projet personnel, commencé en juillet 2026.
            Je suis passionné de science et de nutrition, mais je n'ai pas de formation
            scientifique ou médicale.
          </p>
          <p className={styles.body}>
            Je l'ai créé pour deux raisons. Je voulais rendre accessible en français une veille
            des études scientifiques, en faire un outil de tri performant et complet. Et je voulais aller à rebours des discours qui vendent des
            compléments alimentaires ou fabriquent des « super-aliments » à partir de données
            minces.
          </p>
          <p className={styles.body}>
            Le site traite pour l'instant de nutrition. Le sport et le sommeil sont prévus ensuite.
          </p>
        </section>

        {/* --- D'où viennent les études --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">D'où viennent les études</p>
          <p className={styles.body}>
            Les études sont collectées chaque semaine dans Europe PMC, une base publique qui
            référence la littérature biomédicale, y compris PubMed. Seules les études menées chez
            l'Homme sont retenues dans la veille.
          </p>
          <p className={styles.body}>
            Chaque étude affichée renvoie vers sa publication d'origine.
          </p>
        </section>

        {/* --- Comment elles sont évaluées --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Comment elles sont évaluées</p>
          <p className={styles.body}>
            <strong>Dans la veille</strong>, chaque étude reçoit un{' '}
            <Link href="/niveaux-de-preuve">niveau de preuve</Link> de 1 à 5, selon l'échelle du
            Centre for Evidence-Based Medicine de l'université d'Oxford (2011). Ce niveau dépend du
            type d'étude : une méta-analyse d'essais contrôlés pèse plus qu'une étude sur quelques
            volontaires. Il ne dit pas si l'aliment est efficace.
          </p>
          <p className={styles.body}>
            <strong>Dans les articles</strong>, chaque conclusion reçoit un grade de A à D selon
            GRADE, le système utilisé notamment par l'OMS et Cochrane. Le grade mesure la solidité
            de l'ensemble des preuves sur une question, pas l'importance de l'effet. Chaque
            article explique pourquoi un grade a été attribué.
          </p>
          <p className={styles.body}>
            Quand les données sont insuffisantes, l'article le dit, plutôt que de proposer une
            conclusion.
          </p>
        </section>

        {/* --- Le rôle de l'IA --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Le rôle de l'intelligence artificielle</p>
          <p className={styles.body}>
            Je ne peux pas lire seul des milliers de publications. L'intelligence artificielle
            sélectionne les études pertinentes, rédige les résumés de la veille et propose leur
            niveau de preuve, selon des règles identiques pour toutes.
          </p>
          <p className={styles.body}>
            Ces résumés sont produits automatiquement à partir des résumés des études (les
            abstracts), pas de leur texte intégral. Ils ne sont pas relus un par un. Quand un
            niveau a été corrigé après coup, la fiche l'indique.
          </p>
          <p className={styles.body}>
            Les articles sont rédigés avec l'aide de l'IA à partir des études citées, puis relus
            et validés par moi avant publication.
          </p>
        </section>

        {/* --- Limites --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Les limites</p>
          <p className={styles.body}>
            Les résumés de la veille peuvent contenir des erreurs : contresens, chiffre mal repris
            ou niveau de preuve mal attribué. Un abstract peut aussi présenter les résultats d'une
            étude de façon plus favorable que l'étude elle-même.
          </p>
          <p className={styles.body}>
            Les articles sont relus, mais pas encore par un professionnel de santé.
          </p>
          <p className={styles.body}>
            Rien sur ce site ne remplace un avis médical individualisé.
          </p>
        </section>

        {/* --- Indépendance et financement --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Indépendance et financement</p>
          <p className={styles.body}>
            Le site n'affiche aucune publicité, ne contient aucun lien d'affiliation et n'a aucun
            lien avec des marques ou des vendeurs, de compléments alimentaires ou d'autre chose.
          </p>
          <p className={styles.body}>
            À terme, la veille scientifique deviendra payante pour financer le site. Les articles
            resteront gratuits.
          </p>
        </section>

        {/* --- Corriger et contribuer --- */}
        <section id="relecture-scientifique" className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Corriger et contribuer</p>
          <p className={styles.body}>
            Pour signaler une erreur sur une étude, utilisez le lien « Signaler une erreur » placé
            sous chacune d'elles. Pour un article, écrivez à{' '}
            <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>.
          </p>
          <p className={styles.body}>
            Je cherche aussi un professionnel de santé ou un chercheur pour relire ponctuellement
            les articles. Médecin, pharmacien, diététicien ou chercheur en nutrition, physiologie,
            sport ou médecine préventive : il s'agirait de signaler les erreurs, les formulations
            excessives, les interprétations discutables ou les références manquantes.
          </p>
          <p className={styles.body}>
            Ce serait quelques heures de temps en temps, bénévolement pour commencer, et la
            décision éditoriale finale resterait la mienne. Le relecteur ne doit avoir aucun lien
            avec une marque de compléments alimentaires.
          </p>

          <div style={{ marginTop: '32px' }}>
            <RelectureForm />
          </div>
        </section>

      </div>
    </main>
  );
}
