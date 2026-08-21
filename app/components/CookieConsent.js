'use client';
 
import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
 
export default function CookieConsent() {
  const [consentement, setConsentement] = useState(null);
 
  useEffect(() => {
    const choix = localStorage.getItem('cookie_consent');
    setConsentement(choix);
  }, []);
 
  function accepter() {
    localStorage.setItem('cookie_consent', 'accepte');
    setConsentement('accepte');
  }
 
  function refuser() {
    localStorage.setItem('cookie_consent', 'refuse');
    setConsentement('refuse');
  }
 
  return (
    <>
      {consentement === 'accepte' && (
        <>
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-ZPTWSTEHH0"
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-ZPTWSTEHH0');
            `}
          </Script>
        </>
      )}
 
      {consentement === null && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#fff',
            borderTop: '1px solid #ddd',
            padding: '16px 24px',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
            zIndex: 1000,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontFamily: 'sans-serif',
            fontSize: '14px',
          }}
        >
          <p style={{ margin: 0, flex: '1 1 300px', color: '#333' }}>
            Ce site utilise des cookies de mesure d'audience (Google Analytics) pour comprendre
            comment il est utilisé.{' '}
            <Link href="/politique-confidentialite" style={{ color: '#555' }}>
              En savoir plus
            </Link>
          </p>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={refuser}
              style={{
                padding: '8px 16px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Refuser
            </button>
            <button
              onClick={accepter}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#222',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Accepter
            </button>
          </div>
        </div>
      )}
    </>
  );
}
