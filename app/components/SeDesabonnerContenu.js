'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Page de désabonnement en un clic (12 oct. 2026) : le lien de l'e-mail ouvre cette page,
// et c'est le bouton qui désabonne (pour que les filtres de sécurité des messageries,
// qui ouvrent les liens automatiquement, ne désabonnent personne par erreur).
export default function SeDesabonnerContenu() {
  const token = useSearchParams().get('token');
  const [statut, setStatut] = useState('repos'); // repos | envoi | fait | erreur
  const [message, setMessage] = useState('');

  async function confirmer() {
    setStatut('envoi');
    try {
      const res = await fetch('/api/se-desabonner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatut('erreur');
        setMessage(data.erreur || 'Le désabonnement n\'a pas abouti.');
        return;
      }
      setStatut('fait');
    } catch (e) {
      setStatut('erreur');
      setMessage('Le désabonnement n\'a pas abouti. Vérifiez votre connexion et réessayez.');
    }
  }

  const style = { maxWidth: '600px', margin: '80px auto', padding: '0 20px', textAlign: 'center', fontFamily: 'sans-serif' };

  if (!token) {
    return (
      <main style={style}>
        <h1>Lien incomplet</h1>
        <p>Utilisez le lien « Se désabonner » présent en bas de nos e-mails.</p>
      </main>
    );
  }

  if (statut === 'fait') {
    return (
      <main style={style}>
        <h1>C'est fait</h1>
        <p>Vous ne recevrez plus aucune alerte de ScienceTruths.</p>
        <p>
          Vous pouvez vous réabonner à tout moment depuis la{' '}
          <a href="/veille-scientifique">page de veille scientifique</a>.
        </p>
      </main>
    );
  }

  return (
    <main style={style}>
      <h1>Se désabonner des alertes</h1>
      <p>Vous ne recevrez plus aucun e-mail d'alerte de ScienceTruths, pour aucun sujet.</p>
      <button
        onClick={confirmer}
        disabled={statut === 'envoi'}
        style={{ marginTop: '16px', padding: '10px 20px', fontSize: '15px', border: 'none', borderRadius: '6px', backgroundColor: '#2f4a3a', color: '#fff', cursor: 'pointer' }}
      >
        {statut === 'envoi' ? 'Désabonnement…' : 'Me désabonner de toutes les alertes'}
      </button>
      {statut === 'erreur' && <p style={{ color: '#a33', marginTop: '16px' }}>{message}</p>}
      <p style={{ marginTop: '32px', fontSize: '14px', color: '#666' }}>
        Vous préférez ne retirer que certains sujets ?{' '}
        <a href="/veille-scientifique#gerer-alertes">Gérer mes alertes une par une</a>
      </p>
    </main>
  );
}
