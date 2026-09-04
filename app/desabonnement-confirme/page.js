export default function DesabonnementConfirme() {
  return (
    <main style={{ maxWidth: '600px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
      <h1>Désabonnement confirmé</h1>
      <p>
        Vous ne recevrez plus d'alertes pour cet aliment. Vous pouvez vous
        réabonner à tout moment depuis la page Alertes.
      </p>
      <p>
        <a href="/mes-alertes">Retour à la page Alertes</a>
      </p>
    </main>
  );
}
