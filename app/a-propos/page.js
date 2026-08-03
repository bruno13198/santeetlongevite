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
 
export const metadata = {
  title: 'À propos — Santé et Longévité',
  description:
    "Comment nous sélectionnons, analysons et traduisons les études scientifiques sur la nutrition, en priorisant les preuves solides plutôt que les effets de mode.",
};
 
export default function APropos() {
  return (
    <main className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${styles.page}`}>
      <div className={styles.wrap}>
 
        <p className={styles.eyebrow}>Santé &amp; Longévité — À propos</p>
        <h1 className={styles.h1}>Comprendre ce que dit vraiment la science</h1>
 
        <p className={styles.lede}>
          Dans le domaine de la santé et de la nutrition, il est souvent difficile de distinguer
          les faits des promesses. Les médias, les réseaux sociaux et le marketing nutritionnel
          transforment régulièrement certains aliments en « super-aliments » aux vertus presque
          miraculeuses. À l'inverse, d'autres sont parfois diabolisés sans nuance.
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
          Notre objectif est simple&nbsp;: rendre la recherche scientifique compréhensible,
          accessible et utile au plus grand nombre.
        </p>
 
        <ul className={styles.checklist}>
          <li>fondée sur des preuves&nbsp;;</li>
          <li>présentée avec nuance&nbsp;;</li>
          <li>compréhensible sans être simpliste&nbsp;;</li>
          <li>transparente sur ses limites.</li>
        </ul>
 
        {/* --- Notre principe --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Notre principe</p>
          <p className={styles.body}>
            Pour chaque aliment, complément ou sujet nutritionnel, nous nous appuyons sur la
            littérature médicale internationale (PubMed / Europe PMC). Nous privilégions en priorité&nbsp;:
          </p>
          <ul className={styles.list}>
            <li>les essais cliniques chez l'humain&nbsp;;</li>
            <li>les méta-analyses&nbsp;;</li>
            <li>les revues systématiques&nbsp;;</li>
            <li>les recommandations issues de la recherche de haut niveau.</li>
          </ul>
          <p className={styles.body}>
            Les études préliminaires, expérimentales ou isolées peuvent être mentionnées lorsqu'elles
            apportent un éclairage intéressant, mais elles ne sont jamais présentées comme des preuves
            définitives.
          </p>
          <p className={styles.body}>
            Notre démarche n'est pas de prouver qu'un aliment est bon ou mauvais, mais de présenter
            l'état réel des connaissances scientifiques&nbsp;: bénéfices potentiels, absence d'effet
            démontré, incertitudes… et parfois risques.
          </p>
        </section>
 
        {/* --- Le rôle de l'IA --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Le rôle de l'intelligence artificielle</p>
          <p className={styles.body}>
            La sélection, l'analyse et la traduction des publications scientifiques sont assistées
            par l'intelligence artificielle (Claude, développé par Anthropic). Concrètement, l'IA
            nous aide à&nbsp;:
          </p>
          <ul className={styles.list}>
            <li>identifier les études pertinentes&nbsp;;</li>
            <li>vérifier qu'elles concernent bien la santé humaine&nbsp;;</li>
            <li>éviter les confusions fréquentes (études animales, cellulaires ou hors sujet)&nbsp;;</li>
            <li>extraire les informations essentielles&nbsp;;</li>
            <li>produire des résumés clairs en français.</li>
          </ul>
          <p className={styles.body}>Chaque article comporte généralement&nbsp;:</p>
          <ul className={styles.list}>
            <li>un résumé accessible à tous&nbsp;;</li>
            <li>une analyse plus détaillée pour les lecteurs souhaitant approfondir.</li>
          </ul>
          <p className={styles.body}>
            L'IA ne crée pas de résultats scientifiques&nbsp;: elle synthétise des travaux existants,
            dont les références et les liens vers les publications originales sont systématiquement
            indiqués afin que chacun puisse les consulter.
          </p>
        </section>
 
        {/* --- Approche honnête --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="hype">Une approche honnête de la science</p>
          <p className={styles.body}>
            La nutrition est un domaine complexe. Une seule étude ne suffit presque jamais à
            établir une vérité définitive. Les résultats peuvent varier selon&nbsp;:
          </p>
          <ul className={styles.list}>
            <li>les populations étudiées&nbsp;;</li>
            <li>les doses consommées&nbsp;;</li>
            <li>la durée des essais&nbsp;;</li>
            <li>les habitudes alimentaires globales&nbsp;;</li>
            <li>et la qualité méthodologique des recherches.</li>
          </ul>
          <p className={styles.body}>
            C'est pourquoi nous accordons une grande importance au niveau de preuve et au contexte
            des résultats. Lorsque les données sont insuffisantes ou contradictoires, nous le disons
            clairement.
          </p>
        </section>
 
        {/* --- Ce que vous trouverez / Ce que ce n'est pas --- */}
        <section className={styles.twoCol}>
          <div className={styles.colFind}>
            <p className={styles.tag} data-tone="evidence">Ce que vous trouverez ici</p>
            <ul className={styles.list}>
              <li>des synthèses scientifiques sur les aliments&nbsp;;</li>
              <li>des analyses critiques de compléments alimentaires&nbsp;;</li>
              <li>des outils pratiques liés à la nutrition et à la santé&nbsp;;</li>
              <li>des explications pédagogiques pour mieux comprendre les études scientifiques&nbsp;;</li>
              <li>une approche centrée sur les habitudes de vie réellement associées à une meilleure santé&nbsp;: alimentation, activité physique, sommeil et prévention.</li>
            </ul>
          </div>
          <div className={styles.colNot}>
            <p className={styles.tag} data-tone="muted">Ce que ce site n'est pas</p>
            <p className={styles.body}>Ce site ne remplace pas&nbsp;:</p>
            <ul className={styles.list}>
              <li>une consultation médicale&nbsp;;</li>
              <li>un diagnostic&nbsp;;</li>
              <li>un traitement&nbsp;;</li>
              <li>un suivi nutritionnel personnalisé.</li>
            </ul>
            <p className={styles.body}>
              Il constitue un outil d'information et de compréhension, destiné à vous aider à
              explorer les données scientifiques disponibles avant d'en discuter, si nécessaire,
              avec un professionnel de santé.
            </p>
          </div>
        </section>
 
        {/* --- Engagement / manifeste --- */}
        <section className={styles.manifesto}>
          <p className={styles.tag} data-tone="evidence">Notre engagement</p>
          <p className={styles.body}>
            À une époque où l'information circule plus vite que les preuves, nous avons choisi une
            ligne éditoriale exigeante&nbsp;:
          </p>
          <p className={styles.pullQuote}>
            moins de promesses, plus de preuves<br />
            moins de sensationnel, plus de compréhension<br />
            moins de croyances, plus de science
          </p>
          <p className={styles.body}>
            Si ce site peut vous aider à porter un regard plus critique, plus serein et mieux
            informé sur la nutrition et la santé, alors il aura atteint son objectif.
          </p>
        </section>
 
      </div>
    </main>
  );
}
