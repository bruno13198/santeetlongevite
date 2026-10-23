'use client';

// Liste des problèmes de santé avec cases à cocher (22 oct. 2026), sur la page /sante.
// Cocher un ou plusieurs problèmes (ou « Tous ») fait apparaître un bandeau en bas de l'écran :
// adresse e-mail, champ piège et Cloudflare Turnstile, puis envoi à /api/abonnements
// (même confirmation par e-mail que la veille et le bouton « Suivre ce sujet »).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const CLE_SITE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const CLE_EMAIL_MEMORISE = 'sciencetruths-email-alertes';

export default function ListeProblemes({ familles }) {
  const [choix, setChoix] = useState(() => new Set());
  const [tous, setTous] = useState(false);
  const [email, setEmail] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // champ piège : invisible pour les humains
  const [tokenTurnstile, setTokenTurnstile] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | succes | erreur
  const [message, setMessage] = useState('');
  const conteneurTurnstileRef = useRef(null);
  const widgetTurnstileRef = useRef(null);

  const nbChoisis = tous ? 1 : choix.size;
  const bandeauVisible = nbChoisis > 0 || statut === 'succes';
  const afficherTurnstile = nbChoisis > 0 && statut !== 'succes';

  // Pré-remplir l'adresse déjà utilisée sur ce navigateur
  useEffect(() => {
    try {
      const memorise = window.localStorage.getItem(CLE_EMAIL_MEMORISE);
      if (memorise) setEmail(memorise);
    } catch (e) {
      // stockage indisponible : on ignore
    }
  }, []);

  // Contrôle Turnstile : chargé seulement quand le bandeau est visible
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

  function basculer(id) {
    setStatut('repos');
    setChoix((avant) => {
      const suivant = new Set(avant);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
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
          problemeIds: tous ? [] : [...choix],
          tousLesProblemes: tous,
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
      setChoix(new Set());
      setTous(false);
    } catch (err) {
      setStatut('erreur');
      setMessage("L'inscription n'a pas abouti. Vérifiez votre connexion et réessayez.");
      reinitialiserTurnstile();
    }
  }

  return (
    <div style={{ paddingBottom: bandeauVisible ? '200px' : 0 }}>
      <p style={{ fontSize: '14px', color: '#4A4D45', marginTop: '20px' }}>
        Cochez les problèmes de santé qui vous intéressent pour recevoir chaque lundi les nouvelles études par e-mail.
      </p>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, margin: '4px 0 8px' }}>
        <input
          type="checkbox"
          checked={tous}
          onChange={(e) => {
            setStatut('repos');
            setTous(e.target.checked);
          }}
        />
        Tous les problèmes de santé
      </label>

      {familles.map((famille) => (
        <section key={famille.nom} style={{ marginTop: '24px', opacity: tous ? 0.5 : 1 }}>
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>{famille.nom}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, columns: '2 260px', columnGap: '24px' }}>
            {famille.problemes.map((p) => (
              <li key={p.slug} style={{ breakInside: 'avoid', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <input
                  type="checkbox"
                  aria-label={`Suivre ${p.nom}`}
                  checked={tous || choix.has(p.id)}
                  disabled={tous}
                  onChange={() => basculer(p.id)}
                />
                <span>
                  <Link href={`/sante/${p.slug}`} style={{ color: '#27500A' }}>
                    {p.nom}
                  </Link>
                  <span style={{ color: '#6B6E63', fontSize: '13px' }}> ({p.nb})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {bandeauVisible && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
            borderTop: '2px solid #27500A',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
            padding: '14px 16px',
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: '760px', margin: '0 auto', fontSize: '14px' }}>
            {statut === 'succes' ? (
              <p style={{ margin: 0, color: '#27500A' }}>✓ {message}</p>
            ) : (
              <form onSubmit={valider}>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                  {tous
                    ? 'Tous les problèmes de santé'
                    : `${choix.size} problème${choix.size > 1 ? 's' : ''} de santé sélectionné${choix.size > 1 ? 's' : ''}`}
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Votre adresse e-mail"
                    aria-label="Votre adresse e-mail"
                    style={{ flex: '1 1 220px', padding: '8px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px' }}
                  />
                  <input
                    type="text"
                    value={siteWeb}
                    onChange={(e) => setSiteWeb(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
                  />
                  <button
                    type="submit"
                    disabled={statut === 'envoi'}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', backgroundColor: '#27500A', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {statut === 'envoi' ? 'Envoi…' : 'Recevoir les alertes'}
                  </button>
                </div>
                <div ref={conteneurTurnstileRef} style={{ marginTop: '8px' }} />
                {statut === 'erreur' && <p style={{ margin: '6px 0 0', color: '#B3261E' }}>{message}</p>}
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#6B6E63' }}>
                  Un e-mail le lundi, sans compte. Votre adresse n'est jamais revendue, et vous pouvez vous désabonner
                  en un clic. Un e-mail de confirmation vous sera envoyé : pensez à vérifier vos courriers indésirables.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
