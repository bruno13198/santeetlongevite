import Link from 'next/link';

export const metadata = {
  title: 'Politique de confidentialité | ScienceTruths',
};

export default function PolitiqueConfidentialite() {
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.7' }}>
      <Link href="/" style={{ color: '#555' }}>← Retour à l'accueil</Link>

      <h1 style={{ marginTop: '16px' }}>Politique de confidentialité</h1>

      <p>
        Cette page explique quelles données sont collectées lors de votre navigation sur ce site,
        pourquoi, combien de temps elles sont conservées, et comment vous pouvez exercer vos droits.
      </p>

      <h2>1. Qui collecte vos données ?</h2>
      <p>
        Ce site est édité à titre non professionnel. Pour toute question relative à vos données
        personnelles, vous pouvez contacter l'éditeur à :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>

      <h2>2. Quelles données sont collectées ?</h2>
      <p>
        Ce site n'a pas de système de compte utilisateur. Nous ne collectons que les informations
        que vous nous transmettez volontairement, dans les cas décrits ci-dessous, ainsi que des
        données de mesure d'audience si vous les acceptez.
      </p>

      <h3>Mesure d'audience</h3>
      <p>
        Nous utilisons <strong>Google Analytics</strong> pour mesurer la fréquentation du site
        (nombre de visites, pages consultées, provenance approximative du trafic, type d'appareil).
        Ce service dépose des cookies et collecte des données de navigation (adresse IP tronquée,
        identifiant anonyme de visite). Ces données sont traitées par Google LLC, susceptible de les
        transférer vers des serveurs situés hors de l'Union européenne, notamment aux États-Unis.
      </p>

      <h3>Alertes par e-mail</h3>
      <p>
        Si vous vous inscrivez aux <strong>alertes par e-mail</strong> (page{' '}
        <Link href="/veille-scientifique">Veille scientifique</Link>), nous collectons votre adresse
        e-mail ainsi que les sujets que vous choisissez de suivre (aliments, régimes et habitudes
        alimentaires, nutriments, compléments ou plantes). Ces informations sont utilisées
        uniquement pour vous envoyer, au plus une fois par semaine, les nouvelles études publiées
        sur ces sujets, et pour gérer votre abonnement (confirmation, modification, désabonnement).
        Elles ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.
      </p>
      <p>
        Les e-mails sont envoyés par l'intermédiaire de <strong>Brevo</strong> (Sendinblue SAS,
        France), qui traite votre adresse pour notre compte.
      </p>
      <p>
        Vous pouvez vous désabonner à tout moment, en un clic, grâce au lien « Se désabonner »
        présent en bas de chaque e-mail d'alerte, ou gérer vos abonnements sujet par sujet en
        demandant un lien de gestion en bas de la page{' '}
        <Link href="/veille-scientifique#gerer-alertes">Veille scientifique</Link>.
      </p>

      <h3>Signalement d'une erreur</h3>
      <p>
        Si vous signalez une erreur sur une fiche d'étude, nous enregistrons votre remarque et, si
        vous choisissez de les indiquer, votre nom, votre profession et votre adresse e-mail. Ces
        informations servent uniquement à corriger la fiche et, le cas échéant, à vous répondre.
      </p>

      <h3>Candidature de relecteur</h3>
      <p>
        Si vous soumettez une candidature via le <strong>formulaire de relecture scientifique</strong>
        {' '}(page « À propos »), nous collectons votre profession, votre formation, votre domaine
        d'expertise, votre motivation et votre adresse e-mail. Ces informations sont utilisées
        uniquement pour étudier votre candidature et ne sont partagées avec aucun tiers.
      </p>

      <h3>Protection contre les robots</h3>
      <p>
        Nos formulaires sont protégés par <strong>Cloudflare Turnstile</strong>, un service de
        vérification anti-robots qui analyse de façon technique la requête envoyée (sans cookie
        publicitaire) afin d'empêcher les inscriptions automatisées.
      </p>

      <h2>3. Cookies</h2>
      <p>
        Un bandeau de consentement vous permet d'accepter ou de refuser le dépôt de cookies de
        mesure d'audience lors de votre première visite. Tant que vous n'avez pas donné votre
        consentement, ces cookies ne sont pas déposés.
      </p>
      <p>Vous pouvez à tout moment modifier votre choix en effaçant les cookies de votre navigateur.</p>

      <h2>4. Durée de conservation</h2>
      <p>
        Les données collectées via Google Analytics sont conservées selon les paramètres par défaut
        de Google (généralement 14 mois), après quoi elles sont automatiquement supprimées ou
        anonymisées.
      </p>
      <p>
        Votre adresse e-mail et vos choix d'alertes sont conservés tant que votre abonnement est
        actif. Après votre désabonnement, ils sont supprimés dans un délai d'un an, ou immédiatement
        sur simple demande.
      </p>
      <p>
        Les signalements d'erreur et les candidatures de relecteur sont conservés le temps
        nécessaire à leur traitement, et au plus trois ans.
      </p>

      <h2>5. Vos droits</h2>
      <p>
        Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un
        droit d'accès, de rectification, d'effacement et d'opposition concernant vos données
        personnelles. Vous pouvez exercer ces droits en écrivant à :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>
      <p>
        Vous disposez également du droit d'introduire une réclamation auprès de la Commission
        Nationale de l'Informatique et des Libertés (CNIL) :{' '}
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>
      </p>

      <h2>6. Prestataires et sécurité</h2>
      <p>
        Le site est hébergé par Vercel Inc. et sa base de données par Supabase Inc. Les e-mails
        d'alerte sont envoyés par Brevo (Sendinblue SAS) et les formulaires sont protégés par
        Cloudflare Inc. Ces prestataires appliquent des mesures de sécurité standard du secteur
        pour protéger les données qu'ils traitent.
      </p>

      <h2>7. Contact</h2>
      <p>
        Pour toute question relative à cette politique de confidentialité, contactez-nous à :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>

      <p style={{ color: '#888', fontSize: '13px', marginTop: '40px' }}>
        Dernière mise à jour : 12 octobre 2026
      </p>
    </main>
  );
}
