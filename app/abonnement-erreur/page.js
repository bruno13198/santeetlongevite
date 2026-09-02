export default function AbonnementErreur() {
  return (
    <main style={{ maxWidth: '600px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
      <h1>Lien invalide ou expiré ⚠️</h1>
      <p>
        Ce lien de confirmation n'est plus valide. Cela peut arriver s'il a déjà
        été utilisé, ou si le lien a été mal copié.
      </p>
      <p>
        Vous pouvez retourner sur la fiche de l'aliment concerné pour vous
        réabonner si besoin.
      </p>
      <p>
        <a href="/">Retour à l'accueil</a>
      </p>
    </main>
  );
}
