import Link from 'next/link';
import Breadcrumbs from '../components/Breadcrumbs';
import Disclaimer from '../components/Disclaimer';

export const metadata = {
  title: 'Niveaux de preuve : comment nous classons les études',
  description:
    "Comprendre l'échelle d'Oxford (CEBM 2011) utilisée par la veille scientifique de ScienceTruths : cinq niveaux de preuve, les ajustements appliqués et leurs limites.",
  alternates: { canonical: 'https://sciencetruths.com/niveaux-de-preuve' },
};

const NIVEAUX = [
  {
    niveau: 1,
    fond: '#C0DD97',
    texte: '#173404',
    types: "Méta-analyses, revues systématiques et revues parapluies d'essais randomisés",
    sens: "La preuve la plus solide : plusieurs essais randomisés analysés ensemble, ce qui limite le poids du hasard et des biais d'une étude isolée.",
  },
  {
    niveau: 2,
    fond: '#EAF3DE',
    texte: '#27500A',
    types: 'Essais randomisés contrôlés, y compris les essais croisés',
    sens: "Les participants sont répartis au hasard entre les groupes : c'est la meilleure façon de tester un lien de cause à effet dans une seule étude.",
  },
  {
    niveau: 3,
    fond: '#FAEEDA',
    texte: '#633806',
    types:
      "Études de cohorte, essais non randomisés, randomisation mendélienne, méta-analyses d'études observationnelles",
    sens: "Des données humaines utiles, souvent sur de grands effectifs et de longues durées, mais qui montrent des associations : d'autres facteurs peuvent expliquer le lien observé.",
  },
  {
    niveau: 4,
    fond: '#FAECE7',
    texte: '#712B13',
    types: 'Études transversales, cas-témoins, études pilotes sans groupe témoin, séries de cas, cas cliniques',
    sens: "Des signaux à explorer : photographie à un instant donné, comparaison a posteriori ou très petit nombre de personnes.",
  },
  {
    niveau: 5,
    fond: '#E4E9EE',
    texte: '#34495E',
    types: 'Revues narratives, raisonnements mécanistiques',
    sens: "Des synthèses ou des hypothèses qui aident à comprendre un mécanisme, sans apporter de nouvelles données mesurées chez l'humain.",
  },
];

const styleBadge = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '13px',
  fontWeight: 'bold',
};

export default function NiveauxDePreuve() {
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: 1.6 }}>
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Veille scientifique', url: 'https://sciencetruths.com/veille-scientifique' },
          { nom: 'Niveaux de preuve', url: 'https://sciencetruths.com/niveaux-de-preuve' },
        ]}
      />

      <Link href="/veille-scientifique" style={{ color: '#555' }}>← Retour à la recherche</Link>

      <h1 style={{ marginTop: '16px' }}>Comprendre les niveaux de preuve</h1>

      <p>
        Toutes les études ne se valent pas. Un essai randomisé sur des centaines de personnes et une
        observation sur une poignée de patients peuvent arriver à la même conclusion, mais pas avec la
        même solidité. Pour vous aider à faire la différence d'un coup d'œil, chaque étude de notre veille
        scientifique reçoit un niveau de preuve, de 1 (le plus solide) à 5.
      </p>
      <p>
        Nous utilisons l'échelle du{' '}
        <a href="https://www.cebm.ox.ac.uk/resources/levels-of-evidence/ocebm-levels-of-evidence" target="_blank" rel="noopener noreferrer">
          Centre for Evidence-Based Medicine de l'université d'Oxford
        </a>{' '}
        (version 2011), une référence internationale pour classer une étude isolée.
      </p>

      <h2>Les cinq niveaux</h2>

      {NIVEAUX.map((n) => (
        <div
          key={n.niveau}
          style={{ marginBottom: '16px', padding: '16px', border: '1px solid #eee', borderRadius: '8px' }}
        >
          <span style={{ ...styleBadge, backgroundColor: n.fond, color: n.texte }}>Niveau {n.niveau}</span>
          <p style={{ fontWeight: 'bold', margin: '10px 0 4px' }}>{n.types}</p>
          <p style={{ margin: 0, color: '#444' }}>{n.sens}</p>
        </div>
      ))}

      <h2>Les ajustements</h2>
      <p>
        Le type d'étude fixe un niveau de départ. Ce niveau peut être <strong>abaissé d'un cran</strong>{' '}
        (signalé par une flèche ↓) lorsque le résumé révèle un défaut majeur :
      </p>
      <ul>
        <li>un essai portant sur moins de 30 participants ;</li>
        <li>un essai sans groupe témoin ni placebo, alors qu'il en faudrait un ;</li>
        <li>des résultats explicitement très imprécis ou incohérents, par exemple une forte hétérogénéité entre les études d'une méta-analyse.</li>
      </ul>
      <p>
        Plus rarement, il peut être <strong>relevé d'un cran</strong> (↑) pour un effet très important et net.
        Le motif de chaque ajustement est indiqué sous l'étude.
      </p>
      <p>
        Une étude qui ne trouve aucun effet n'est jamais pénalisée : l'absence d'effet est un résultat
        aussi valable qu'un autre.
      </p>

      <h2>Ce que le niveau ne dit pas</h2>
      <p>
        Le niveau de preuve mesure la <strong>solidité de la méthode</strong>, pas le sens du résultat.
        Une étude de niveau 1 peut conclure qu'un aliment n'a aucun effet ; une étude de niveau 5 n'est pas
        fausse, elle apporte simplement peu de preuve directe.
      </p>
      <p>
        Il ne dit pas non plus si le produit testé correspond exactement à l'aliment de la fiche. Un essai
        sur un extrait concentré de curcuma reste un essai randomisé, mais ses résultats ne s'appliquent pas
        forcément au curcuma en poudre de votre cuisine. Pensez à lire le résumé.
      </p>

      <h2>Comment le classement est établi</h2>
      <p>
        Le niveau est attribué automatiquement, à partir du titre et du résumé de chaque étude, par une
        analyse assistée par intelligence artificielle qui suit des règles fixes et identiques pour toutes
        les études. Les seuils chiffrés, comme celui des 30 participants, sont appliqués mécaniquement.
      </p>
      <p>
        Un résumé ne contient pas tous les détails d'une étude : ce classement est une estimation, utile pour
        s'orienter, mais qui ne remplace pas la lecture de l'article complet. Chaque étude renvoie vers sa
        source originale.
      </p>

      <h2>Et dans nos articles ?</h2>
      <p>
        Nos articles de synthèse vont plus loin : ils évaluent l'ensemble des études disponibles sur un
        effet donné, selon le système international GRADE, et attribuent un grade de A à D à chaque
        conclusion.
      </p>

      <Disclaimer />
    </main>
  );
}
