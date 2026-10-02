'use client';

import { useState, useEffect, useRef } from 'react';

// Protection anti-robots (2 oct. 2026) : Cloudflare Turnstile en mode discret + champ piège.
const CLE_SITE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function DemandeLienGestion() {
  const [email, setEmail] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // champ piège : invisible pour les humains
  const [tokenTurnstile, setTokenTurnstile] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | envoye | attente
  const conteneurTurnstileRef = useRef(null);
  const widgetTurnstileRef = useRef(null);

  // Chargement du contrôle Turnstile (le script est partagé avec le formulaire d'alertes)
  useEffect(() => {
    function afficherWidget() {
      if (!window.turnstile || !conteneurTurnstileRef.current || widgetTurnstileRef.current !== null) return;
      widgetTurnstileRef.current = window.turnstile.render(conteneurTurnstileRef.current, {
        sitekey: CLE_SITE_TURNSTILE,
        language: 'fr',
        appearance: 'interaction-only', // ne s'affiche que si une vérification est nécessaire
        callback: (token) => setTokenTurnstile(token),
        'expired-callback': () => setTokenTurnstile(''),
        'error-callback': () => setTokenTurnstile(''),
      });
    }

    if (window.turnstile) {
      afficherWidget();
      return;
    }

    let script = document.querySelector('script[data-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = '1';
      document.head.appendChild(script);
    }
    script.addEventListener('load', afficherWidget);
    return () => script.removeEventListener('load', afficherWidget);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!tokenTurnstile) {
      setStatut('attente');
      return;
    }

    setStatut('envoi');

    try {
      await fetch('/api/lien-magique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tokenTurnstile, siteWeb }),
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
        Pensez à vérifier vos spams si vous ne le voyez pas arriver.
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

      {/* Champ piège : invisible et inaccessible pour les humains, rempli par les robots */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
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

      <button
        type="submit"
        disabled={statut === 'envoi'}
        style={{ padding: '6px 12px', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        {statut === 'envoi' ? 'Envoi...' : 'Recevoir mon lien'}
      </button>

      {/* Vérification anti-robot : invisible sauf si Cloudflare a un doute */}
      <div ref={conteneurTurnstileRef} style={{ flexBasis: '100%' }} />

      {statut === 'attente' && (
        <p style={{ flexBasis: '100%', fontSize: '13px', color: '#c00', margin: 0 }}>
          Vérification anti-robot en cours, réessayez dans quelques secondes.
        </p>
      )}
    </form>
  );
}
