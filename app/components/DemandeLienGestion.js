'use client';

import { useState } from 'react';

export default function DemandeLienGestion() {
  const [email, setEmail] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | envoye

  async function handleSubmit(e) {
    e.preventDefault();
    setStatut('envoi');

    try {
      await fetch('/api/lien-magique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      // On affiche le message générique même en cas d'erreur réseau,
      // pour ne pas révéler d'info technique.
    }

    setStatut('envoye');
  }

  if (statut === 'envoye') {
    return (
      <p style={{ fontSize: '14px', color: '#555' }}>
        Si cette adresse est associée à des alertes, un lien de gestion vient de lui être envoyé.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', color: '#555' }}>Déjà abonné(e) ? Gérer mes alertes :</span>
      <input
        type="email"
        required
        placeholder="votre@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px' }}
      />
      <button
        type="submit"
        disabled={statut === 'envoi'}
        style={{ padding: '6px 12px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        {statut === 'envoi' ? 'Envoi...' : 'Recevoir mon lien'}
      </button>
    </form>
  );
}
