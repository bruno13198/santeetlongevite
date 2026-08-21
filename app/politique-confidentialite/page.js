import Link from 'next/link';
 
export const metadata = {
  title: 'Politique de confidentialité — Super Aliments Santé',
};
 
export default function PolitiqueConfidentialite() {
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.7' }}>
      <Link href="/" style={{ color: '#555' }}>← Retour à l'accueil</Link>
 
      <h1 style={{ marginTop: '16px' }}>Politique de confidentialité</h1>
 
      <p>
        Cette page explique quelles données sont collectées lors de votre navigation sur ce site,
        pourquoi, et comment vous pouvez exercer vos droits.
      </p>
 
      <h2>1. Qui collecte vos données ?</h2>
      <p>
        Ce site est édité à titre non professionnel. Pour toute question relative à vos données
        personnelles, vous pouvez contacter l'éditeur à :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>
 
      <h2>2. Quelles données sont collectées ?</h2>
      <p>
        Ce site n'a pas de système de compte utilisateur : nous ne collectons ni votre nom, ni
        votre adresse e-mail, ni aucune information que vous ne nous transmettez pas
        volontairement (par exemple en nous écrivant par e-mail).
      </p>
      <p>
        En revanche, nous utilisons <strong>Google Analytics</strong> pour mesurer la fréquentation
        du site (nombre de visites, pages consultées, provenance approximative du trafic, type
        d'appareil). Ce service dépose des cookies et collecte des données de navigation
        (adresse IP tronquée, identifiant anonyme de visite).
      </p>
      <p>
        Ces données sont traitées par Google LLC, susceptible de les transférer vers des serveurs
        situés hors de l'Union européenne, notamment aux États-Unis.
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
        Les données collectées via Google Analytics sont conservées selon les paramètres par
        défaut de Google (généralement 14 mois), après quoi elles sont automatiquement supprimées
        ou anonymisées.
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
 
      <h2>6. Sécurité</h2>
      <p>
        Le site est hébergé par Vercel Inc. et sa base de données par Supabase Inc., deux
        prestataires appliquant des mesures de sécurité standard du secteur pour protéger les
        données hébergées.
      </p>
 
      <h2>7. Contact</h2>
      <p>
        Pour toute question relative à cette politique de confidentialité, contactez-nous à :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>
 
      <p style={{ color: '#888', fontSize: '13px', marginTop: '40px' }}>
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </main>
  );
}
