'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function GererAlertesContenu() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [statut, setStatut] = useState('chargement'); // chargement | valide | invalide
  const [email, setEmail] = useState('');
  const [abonnements, setAbonnements] = useState([]);

  useEffect(() => {
    if (!token) {
      setStatut('invalide');
      return;
    }

    fetch(`/api/lien-magique/verifier?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.valide) {
          setStatut('invalide');
          return;
        }
        setEmail(data.email);
        setAbonnements(data.abonnements);
        setStatut('valide');
      })
      .catch(() => setStatut('invalide'));
  }, [token]);

  async function neplusSuivre(abonnementId) {
    const res = await fetch('/api/lien-magique/desabonner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, abonnementId }),
    });

    if (res.ok) {
      setAbonnements((prev) => prev.filter((a) => a.id !== abonnementId));
    }
  }

  if (statut === 'chargement') {
    return <main style={{ padding: '40px', textAlign: 'center' }}>Vérification en cours...</main>;
  }

  if (statut === 'invalide') {
    return (
      <main style={{ maxWidth: '600px', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1>Lien invalide ou expiré ⚠️</h1>
        <p>Ce lien n'est plus valide (il expire après 1 heure). Retournez sur la page Alertes pour en redemander un.</p>
        <p><a href="/mes-alertes">Retour à la page Alertes</a></p>
      </main>
    );
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Gérer mes alertes</h1>
      <p style={{ color: '#555' }}>Abonnements actifs pour {email} :</p>

      {abonnements.length === 0 && <p>Aucun abonnement actif.</p>}

      {abonnements.map((a) => (
        <div
          key={a.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            border: '1px solid #eee',
            borderRadius: '8px',
            marginBottom: '10px',
          }}
        >
          <span>{a.tous ? 'Tous les aliments' : a.aliment?.nom || 'Aliment supprimé'}</span>
          <button
            onClick={() => neplusSuivre(a.id)}
            style={{ padding: '6px 12px', backgroundColor: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            Ne plus suivre
          </button>
        </div>
      ))}

      <p style={{ marginTop: '24px' }}>
        <a href="/mes-alertes">← Suivre un aliment supplémentaire</a>
      </p>
    </main>
  );
}
