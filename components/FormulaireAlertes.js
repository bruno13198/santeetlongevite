'use client';

import { useState, useEffect, useRef } from 'react';

export default function FormulaireAlertes() {
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState([]);
  const [alimentsChoisis, setAlimentsChoisis] = useState([]);
  const [tousLesAliments, setTousLesAliments] = useState(false);
  const [email, setEmail] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | succes | erreur
  const [message, setMessage] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      const res = await fetch(`/api/aliments/recherche?q=${encodeURIComponent(recherche)}`);
      const data = await res.json();
      setResultats(data.resultats || []);
    }, 300);
  }, [recherche]);

  function ajouterAliment(aliment) {
    if (!alimentsChoisis.find((a) => a.id === aliment.id)) {
      setAlimentsChoisis([...alimentsChoisis, aliment]);
    }
    setRecherche('');
    setResultats([]);
  }

  function retirerAliment(id) {
    setAlimentsChoisis(alimentsChoisis.filter((a) => a.id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatut('envoi');
    setMessage('');

    try {
      const res = await fetch('/api/abonnements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          alimentIds: alimentsChoisis.map((a) => a.id),
          tousLesAliments,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatut('erreur');
        setMessage(data.erreur || 'Une erreur est survenue.');
        return;
      }

      setStatut('succes');
      setMessage(data.message);
    } catch (err) {
      setStatut('erreur');
      setMessage('Une erreur est survenue. Réessayez plus tard.');
    }
  }

  if (statut === 'succes') {
    return (
      <div style={{ padding: '24px', backgroundColor: '#f0f7ff', borderRadius: '8px' }}>
        <p style={{ margin: 0 }}>{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '600px' }}>
      {/* Tous les aliments */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontWeight: 'bold' }}>
        <input
          type="checkbox"
          checked={tousLesAliments}
          onChange={(e) => setTousLesAliments(e.target.checked)}
        />
        Tous les aliments
      </label>

      {/* Sélection d'aliments précis, désactivée si "tous" est coché */}
      <div style={{ opacity: tousLesAliments ? 0.4 : 1, pointerEvents: tousLesAliments ? 'none' : 'auto', marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px' }}>
          Ou choisissez un ou plusieurs aliments précis :
        </label>

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Rechercher un aliment (ex: curcuma)"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px' }}
          />
          {resultats.length > 0 && (
            <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '6px', listStyle: 'none', margin: 0, padding: '4px 0', zIndex: 10 }}>
              {resultats.map((aliment) => (
                <li
                  key={aliment.id}
                  onClick={() => ajouterAliment(aliment)}
                  style={{ padding: '8px 12px', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.target.style.backgroundColor = '#f5f5f5')}
                  onMouseLeave={(e) => (e.target.style.backgroundColor = 'white')}
                >
                  {aliment.nom}
                </li>
              ))}
            </ul>
          )}
        </div>

        {alimentsChoisis.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {alimentsChoisis.map((aliment) => (
              <span
                key={aliment.id}
                style={{ backgroundColor: '#e8f0fe', padding: '4px 10px', borderRadius: '14px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {aliment.nom}
                <button
                  type="button"
                  onClick={() => retirerAliment(aliment.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sport et sommeil, grisés */}
      <div style={{ opacity: 0.4, marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <input type="checkbox" disabled />
          Sport et activité physique <em style={{ fontSize: '13px' }}>(bientôt disponible)</em>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" disabled />
          Sommeil <em style={{ fontSize: '13px' }}>(bientôt disponible)</em>
        </label>
      </div>

      {/* Email */}
      <label style={{ display: 'block', marginBottom: '8px' }}>Votre adresse email :</label>
      <input
        type="email"
        required
        placeholder="votre@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', marginBottom: '16px' }}
      />

      <button
        type="submit"
        disabled={statut === 'envoi'}
        style={{ padding: '10px 20px', backgroundColor: '#0066cc', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '15px' }}
      >
        {statut === 'envoi' ? 'Envoi...' : 'Valider'}
      </button>

      {statut === 'erreur' && (
        <p style={{ color: '#c00', marginTop: '12px' }}>{message}</p>
      )}
    </form>
  );
}
