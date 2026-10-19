'use client';

// Bouton « Suivre ce sujet » (14 oct. 2026), affiché sur chaque fiche (aliment, régime, nutriment).
// Un clic déplie un petit formulaire : adresse e-mail, champ piège et Cloudflare Turnstile,
// puis envoi à la route /api/abonnements existante (même confirmation par e-mail qu'ailleurs).
// L'adresse est mémorisée dans le navigateur pour être pré-remplie la fois suivante.

import { useEffect, useRef, useState } from 'react';

const CLE_SITE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const CLE_EMAIL_MEMORISE = 'sciencetruths-email-alertes';

// Correspondance entre le type de fiche et les champs attendus par /api/abonnements
const CHAMP_PAR_TYPE = {
  aliment: 'alimentIds',
  habitude: 'habitudeIds',
  nutriment: 'nutrimentIds',
};

export default function SuivreSujet({ type, sujetId, nom }) {
  const [ouvert, setOuvert] = useState(false);
  const [email, setEmail] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // champ piège : invisible pour les humains
  const [tokenTurnstile, setTokenTurnstile] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | succes | erreur
  const [message, setMessage] = useState('');

  const conteneurTurnstileRef = useRef(null);
  const widgetTurnstileRef = useRef(null);

  // Pré-remplir l'adresse déjà utilisée sur ce navigateur
  useEffect(() => {
    try {
      const memorise = window.localStorage.getItem(CLE_EMAIL_MEMORISE);
      if (memorise) setEmail(memorise);
    } catch (e) {
      // stockage indisponible : on ignore
    }
  }, []);

  // Contrôle Turnstile : chargé seulement quand le formulaire est ouvert
  const afficherTurnstile = ouvert && statut !== 'succes';
  useEffect(() => {
    if (!afficherTurnstile) return undefined;

    function afficherWidget() {
      if (!window.turnstile || !conteneurTurnstileRef.current || widgetTurnstileRef.current !== null) return;
      widgetTurnstileRef.current = window.turnstile.render(conteneurTurnstileRef.current, {
        sitekey: CLE_SITE_TURNSTILE,
        language: 'fr',
        callback: (token) => setTokenTurnstile(token),
        'expired-callback': () => setTokenTurnstile(''),
        'error-callback': () => setTokenTurnstile(''),
      });
    }

    let script = null;
    if (window.turnstile) {
      afficherWidget();
    } else {
      script = document.querySelector('script[data-turnstile]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = '1';
        document.head.appendChild(script);
      }
      script.addEventListener('load', afficherWidget);
    }

    return () => {
      if (script) script.removeEventListener('load', afficherWidget);
      if (window.turnstile && widgetTurnstileRef.current !== null) {
        window.turnstile.remove(widgetTurnstileRef.current);
      }
      widgetTurnstileRef.current = null;
      setTokenTurnstile('');
    };
  }, [afficherTurnstile]);

  function reinitialiserTurnstile() {
    setTokenTurnstile('');
    if (window.turnstile && widgetTurnstileRef.current !== null) {
      window.turnstile.reset(widgetTurnstileRef.current);
    }
  }

  async function valider(e) {
    e.preventDefault();
    if (!tokenTurnstile) {
      setStatut('erreur');
      setMessage('Vérification anti-robot en cours. Patientez quelques secondes, puis réessayez.');
      return;
    }

    setStatut('envoi');
    setMessage('');
    try {
      const res = await fetch('/api/abonnements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          [CHAMP_PAR_TYPE[type]]: [sujetId],
          tokenTurnstile,
          siteWeb,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatut('erreur');
        setMessage(data.erreur || "L'inscription n'a pas abouti. Réessayez.");
        reinitialiserTurnstile(); // un jeton Turnstile ne sert qu'une fois
        return;
      }
      try {
        window.localStorage.setItem(CLE_EMAIL_MEMORISE, email);
      } catch (err) {
        // stockage indisponible : on ignore
      }
      setStatut('succes');
      setMessage(data.message);
    } catch (err) {
      setStatut('erreur');
      setMessage("L'inscription n'a pas abouti. Vérifiez votre connexion et réessayez.");
      reinitialiserTurnstile();
    }
  }

  const cadre = {
    margin: '8px 0 24px',
    padding: '12px 16px',
    border: '1px solid #c9d8bf',
    borderRadius: '8px',
    backgroundColor: '#f4f8ef',
    fontSize: '14px',
  };

  if (!ouvert) {
    return (
      <div style={cadre}>
        <button
          type="button"
          onClick={() => setOuvert(true)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#2f4a3a' }}
        >
          🔔 Suivre ce sujet
        </button>
                <span style={{ color: '#555' }}> — recevez chaque lundi par e-mail les nouvelles études sur {nom}.</span>
      </div>
    );
  }

  if (statut === 'succes') {
    return (
      <div style={cadre}>
        <strong>Presque fini !</strong> {message}
      </div>
    );
  }

  return (
    <form onSubmit={valider} style={cadre}>
      <p style={{ margin: '0 0 8px' }}>
                Recevez chaque lundi les nouvelles études sur <strong>{nom}</strong>, avec leur niveau de preuve.
        Gratuit et sans compte. Votre adresse n'est jamais revendue, et vous pouvez vous désabonner en un clic.
      </p>
      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span style={{ display: 'block', marginBottom: '4px' }}>Votre adresse e-mail</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', maxWidth: '360px', padding: '8px', fontSize: '15px', border: '1px solid #bbb', borderRadius: '6px' }}
        />
      </label>

      {/* Champ piège : invisible et inaccessible pour les humains, rempli par les robots */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
        <label>
          Ne pas remplir ce champ
          <input
            type="text"
            name="site_web"
            tabIndex={-1}
            autoComplete="off"
            value={siteWeb}
            onChange={(e) => setSiteWeb(e.target.value)}
          />
        </label>
      </div>

      <div ref={conteneurTurnstileRef} style={{ margin: '8px 0' }} />

      <button
        type="submit"
        disabled={statut === 'envoi'}
        style={{ padding: '8px 16px', fontSize: '14px', border: 'none', borderRadius: '6px', backgroundColor: '#2f4a3a', color: '#fff', cursor: 'pointer' }}
      >
        {statut === 'envoi' ? 'Envoi en cours…' : 'Suivre ce sujet'}
      </button>
      <button
        type="button"
        onClick={() => setOuvert(false)}
        style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '14px' }}
      >
        Annuler
      </button>

      {statut === 'erreur' && <p style={{ color: '#a33', margin: '8px 0 0' }}>{message}</p>}
      <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#666' }}>
        Un e-mail de confirmation vous sera envoyé : pensez à vérifier vos courriers indésirables.
      </p>
    </form>
  );
}
