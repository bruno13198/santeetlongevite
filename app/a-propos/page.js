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
        <h1 className={styles.h1}>La science de la santé, sans le bruit autour</h1>
 
        <p className={styles.lede}>
          Dans le domaine de la santé, de la nutrition et de la longévité, il n'est pas toujours
          facile de savoir ce qui repose réellement sur des preuves.
        </p>
        <p className={styles.lede}>
          Un aliment devient parfois un « super-aliment ». Une molécule est présentée comme
          révolutionnaire. Une nouvelle étude fait la une des médias et semble, à elle seule,
          remettre en question tout ce que l'on croyait savoir.
        </p>
        <p className={styles.lede}>
          Pourtant, la recherche scientifique est rarement aussi simple. Une étude n'est pas une
          vérité. Un résultat intéressant n'est pas nécessairement un effet démontré. Et l'absence
          de preuve n'est pas la preuve d'un effet.
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
          Ce site est né d'une idée simple&nbsp;: permettre à chacun de revenir aux données
          scientifiques elles-mêmes, sans avoir à lire des milliers de publications pour
          comprendre ce qu'elles signifient.
        </p>
        <p className={styles.lede}>
          Notre objectif est de rendre la science plus accessible pour mieux comprendre les
          facteurs qui peuvent contribuer à vivre plus longtemps, mais surtout à vivre plus
          longtemps en bonne santé.
        </p>
 
        {/* --- Les quatre piliers --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Santé et longévité au quotidien</p>
          <p className={styles.body}>
            La longévité ne se résume pas à chercher une molécule ou un aliment capable de
            « ralentir le vieillissement ». Elle repose sur un ensemble de facteurs qui
            interagissent entre eux. C'est pourquoi le site s'intéresse notamment à quatre grands
            domaines&nbsp;:
          </p>
          <ul className={styles.list}>
            <li>
              🥗 <strong>Alimentation</strong> — aliments, nutriments, habitudes alimentaires,
              compléments alimentaires et effets potentiels sur la santé. Nous cherchons à
              distinguer les bénéfices réellement démontrés des promesses qui reposent encore sur
              des données préliminaires.
            </li>
            <li>
              🏃 <strong>Sport et activité physique</strong> — endurance, course, renforcement
              musculaire, condition physique, VO₂ max, sédentarité et effets de l'activité
              physique sur la santé et la longévité. C'est aujourd'hui l'un des facteurs de mode
              de vie les mieux documentés pour la santé globale, associé à une diminution de
              nombreux risques cardiovasculaires et métaboliques, ainsi qu'à des bénéfices sur la
              santé mentale, cognitive et le sommeil.
            </li>
            <li>
              😴 <strong>Sommeil</strong> — durée et qualité du sommeil, rythmes de vie,
              récupération et liens entre sommeil, santé et vieillissement. Le sommeil interagit
              avec l'activité physique, l'alimentation et de nombreux autres comportements liés à
              la santé.
            </li>
            <li>
              🧬 <strong>Longévité</strong> — vieillissement, prévention, santé cardiovasculaire,
              métabolique et cognitive, maintien de la condition physique et habitudes
              susceptibles de favoriser une longévité en bonne santé. L'idée n'est pas de
              promettre de vivre jusqu'à un âge donné, mais de comprendre ce que la science permet
              réellement de faire pour augmenter les chances de rester en bonne santé le plus
              longtemps possible.
            </li>
          </ul>
        </section>
 
        {/* --- Comprendre avant de croire --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Comprendre avant de croire</p>
          <p className={styles.body}>
            Pour chaque sujet, nous cherchons à répondre à des questions concrètes&nbsp;:
          </p>
          <ul className={styles.list}>
            <li>Que sait-on réellement&nbsp;?</li>
            <li>Quel est le niveau de preuve&nbsp;?</li>
            <li>Les résultats sont-ils cohérents entre les études&nbsp;?</li>
            <li>Les effets observés chez l'humain sont-ils réellement significatifs&nbsp;?</li>
            <li>Existe-t-il des risques&nbsp;?</li>
            <li>Et surtout&nbsp;: qu'est-ce que la recherche ne permet pas encore d'affirmer&nbsp;?</li>
          </ul>
          <p className={styles.body}>
            Nous accordons une importance particulière aux essais cliniques, études
            observationnelles, revues systématiques et méta-analyses, tout en tenant compte de la
            méthodologie et des limites propres à chaque étude.
          </p>
        </section>
 
        {/* --- Des articles pour comprendre --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Des articles pour comprendre</p>
          <p className={styles.body}>
            Les articles constituent la porte d'entrée la plus accessible du site. Ils permettent
            de découvrir, aliment par aliment ou sujet par sujet, ce que la recherche scientifique
            permet réellement de dire.
          </p>
          <p className={styles.body}>
            L'objectif n'est pas de transformer chaque aliment en médicament miracle, ni de
            dresser une liste simpliste d'aliments « bons » et « mauvais ». Un aliment peut
            présenter plusieurs bénéfices potentiels tout en ayant certaines limites. Un effet peut
            être observé dans certaines conditions mais pas dans d'autres. Une association peut
            être retrouvée dans une étude observationnelle sans que l'on puisse démontrer une
            relation de cause à effet. Et parfois, malgré de nombreuses recherches, les preuves
            restent insuffisantes.
          </p>
          <p className={styles.body}>
            Cette nuance fait partie intégrante de l'information que nous voulons proposer.
          </p>
        </section>
 
        {/* --- Explorer les études --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">Explorer les études scientifiques</p>
          <p className={styles.body}>
            Les articles ne sont que la première étape. Pour ceux qui souhaitent aller plus loin,
            le site permet également d'explorer les études scientifiques à l'origine des
            informations présentées.
          </p>
          <p className={styles.body}>
            Notre objectif est de créer un lien simple entre le grand public et la littérature
            scientifique. Vous pouvez ainsi commencer par un article accessible, puis consulter
            les études qui le composent, approfondir un résultat particulier et, si vous le
            souhaitez, revenir directement à la publication originale.
          </p>
          <p className={styles.body}>Pas besoin de nous croire sur parole.</p>
        </section>
 
        {/* --- Moteur de recherche --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="hype">Un moteur de recherche scientifique</p>
          <p className={styles.body}>
            La recherche médicale et scientifique représente une quantité considérable de
            publications. Le problème n'est donc plus seulement de trouver une étude. C'est de
            trouver les bonnes études.
          </p>
          <p className={styles.body}>
            Le moteur de recherche permet d'explorer cette littérature autour d'un aliment, d'un
            nutriment, d'une activité physique, d'un problème de santé, du sommeil ou de tout autre
            sujet lié à la santé et à la longévité.
          </p>
          <p className={styles.body}>
            L'idée est de transformer une question simple — « Est-ce que cet aliment est vraiment
            bénéfique pour la santé&nbsp;? » — en un point de départ vers les recherches
            scientifiques qui existent réellement sur le sujet.
          </p>
        </section>
 
        {/* --- Une base d'études --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Une base d'études, pas une collection de titres</p>
          <p className={styles.body}>
            Toutes les études ne se valent pas. Une expérience réalisée sur des cellules, une
            étude chez l'animal, une étude observationnelle portant sur plusieurs milliers de
            personnes et un essai clinique randomisé ne permettent pas de tirer les mêmes
            conclusions.
          </p>
          <p className={styles.body}>
            De la même manière, une petite étude isolée ne doit pas nécessairement être mise sur
            le même plan qu'une méta-analyse regroupant plusieurs dizaines d'études. Nous
            cherchons donc à qualifier les publications et à donner davantage de poids aux données
            les plus solides, plutôt qu'à simplement accumuler des références.
          </p>
        </section>
 
        {/* --- Le rôle de l'IA --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="mono">L'intelligence artificielle comme outil</p>
          <p className={styles.body}>
            Une partie du travail de recherche, de sélection, de vérification et de synthèse est
            assistée par l'intelligence artificielle. Elle permet notamment de traiter une grande
            quantité de publications, d'identifier les études pertinentes, d'en extraire les
            informations essentielles et de les rendre accessibles en français.
          </p>
          <p className={styles.body}>
            Mais l'intelligence artificielle n'est pas la source de l'information. La source reste
            la publication scientifique. Les références et les liens vers les études originales
            permettent de retrouver les travaux utilisés et de vérifier les informations
            présentées.
          </p>
          <p className={styles.body}>
            L'IA est donc un outil pour faciliter l'accès à la connaissance scientifique, pas pour
            remplacer la recherche scientifique elle-même.
          </p>
          <p className={styles.body}>
            Chaque article est rédigé avec cette assistance, puis relu et validé par la rédaction
            avant publication. Si vous repérez une erreur, une imprécision ou une source manquante,
            écrivez-nous à{' '}
            <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>.
          </p>
        </section>
 
        {/* --- Pas de super-aliments --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="hype">Pas de « super-aliments » ni de solutions miracles</p>
          <p className={styles.body}>
            Nous ne cherchons pas à vous dire quel aliment est miraculeux. Nous ne cherchons pas
            non plus à vous vendre une méthode secrète pour vivre plus longtemps. La réalité est
            généralement beaucoup plus intéressante que cela.
          </p>
          <p className={styles.body}>
            La santé et la longévité sont influencées par une multitude de facteurs&nbsp;:
            alimentation, activité physique, sommeil, composition corporelle, habitudes de vie,
            environnement et prévention, entre autres. Les effets sont souvent progressifs,
            modestes individuellement et surtout interdépendants. C'est précisément cette réalité
            que nous voulons explorer.
          </p>
        </section>
 
        {/* --- Et lorsque la science ne sait pas --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="muted">Et lorsque la science ne sait pas&nbsp;?</p>
          <p className={styles.body}>
            Nous le disons. Certaines questions sont très bien documentées. D'autres reposent sur
            quelques études seulement. Certaines présentent des résultats contradictoires.
          </p>
          <p className={styles.pullQuote}>« Les preuves sont insuffisantes. »</p>
          <p className={styles.body}>
            plutôt que de donner une réponse artificiellement certaine. Pour nous, reconnaître
            l'incertitude n'est pas une faiblesse de la science. C'est l'une de ses forces.
          </p>
        </section>
 
        {/* --- Base en évolution --- */}
        <section className={styles.section}>
          <p className={styles.tag} data-tone="evidence">Une base de connaissances en évolution</p>
          <p className={styles.body}>
            La science évolue en permanence. De nouvelles études sont publiées, certaines
            hypothèses sont renforcées, d'autres sont remises en question. Le site est donc conçu
            comme une base vivante de connaissances, et non comme une collection de réponses
            définitives.
          </p>
          <p className={styles.body}>
            Les articles peuvent évoluer lorsque de nouvelles données importantes apparaissent. La
            base d'études s'enrichit progressivement et le moteur de recherche permet d'aller
            au-delà des contenus déjà publiés.
          </p>
        </section>
 
        {/* --- Engagement / manifeste --- */}
        <section className={styles.manifesto}>
          <p className={styles.tag} data-tone="evidence">Notre objectif</p>
          <p className={styles.body}>
            Nous ne voulons pas vous dire quoi penser. Nous voulons vous donner les moyens de
            mieux comprendre ce que la science sait, ce qu'elle suggère et ce qu'elle ignore
            encore.
          </p>
          <p className={styles.body}>
            Alimentation. Sport. Sommeil. Santé. Longévité. Cinq sujets qui peuvent sembler
            différents, mais qui participent tous à une même question&nbsp;: comment rester en
            bonne santé le plus longtemps possible&nbsp;?
          </p>
          <p className={styles.body}>
            Parce qu'en matière de santé, une bonne information n'est pas forcément celle qui
            donne la réponse la plus spectaculaire. C'est celle qui vous permet de prendre une
            décision éclairée à partir des meilleures preuves disponibles.
          </p>
          <p className={styles.pullQuote}>
            Moins de promesses. Plus de preuves.<br />
            Moins de bruit. Plus de science.
          </p>
        </section>
 
      </div>
    </main>
  );
}
