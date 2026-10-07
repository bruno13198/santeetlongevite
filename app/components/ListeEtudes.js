'use client';

import { useEffect, useRef, useState } from 'react';

// Couleurs des niveaux de preuve Oxford (CEBM 2011) : fond clair + texte foncé de la même famille.
const COULEURS_NIVEAUX = {
  1: { fond: '#C0DD97', texte: '#173404' },
  2: { fond: '#EAF3DE', texte: '#27500A' },
  3: { fond: '#FAEEDA', texte: '#633806' },
  4: { fond: '#FAECE7', texte: '#712B13' },
  5: { fond: '#E4E9EE', texte: '#34495E' },
};

// Ancien badge, affiché seulement pour les études pas encore reclassées (transition).
const ANCIENS_BADGES = {
  haute: { fond: '#d4edda', texte: '#155724', libelle: 'Haute fiabilité' },
  moderee: { fond: '#fff3cd', texte: '#856404', libelle: 'Fiabilité modérée' },
  preliminaire: { fond: '#ffe5d0', texte: '#9a4d00', libelle: 'Préliminaire' },
};

// Types de signalement (mêmes clés que la route /api/signalements).
const TYPES_SIGNALEMENT = [
  { cle: 'resume', libelle: 'Résumé inexact ou incomplet' },
  { cle: 'niveau', libelle: 'Niveau de preuve contestable' },
  { cle: 'hors_sujet', libelle: 'Étude hors sujet pour cette fiche' },
  { cle: 'autre', libelle: 'Autre' },
];

const CLE_SITE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const styleBadge = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '13px',
  fontWeight: 'bold',
};

const styleChamp = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  fontSize: '14px',
  fontFamily: 'inherit',
};

function formaterEffectif(n) {
  return Number(n).toLocaleString('fr-FR');
}

// Charge une seule fois le script Cloudflare Turnstile, puis appelle rappel().
function chargerTurnstile(rappel) {
  if (window.turnstile) {
    rappel();
    return () => {};
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
  script.addEventListener('load', rappel);
  return () => script.removeEventListener('load', rappel);
}

function BlocPreuve({ etude }) {
  // Étude reclassée : badge Oxford, effectif, et badge d'ajustement s'il y en a un.
  if (etude.niveau_preuve) {
    const couleurs = COULEURS_NIVEAUX[etude.niveau_preuve];
    const ajustement = etude.ajustement_preuve || '';
    const abaisse = ajustement.startsWith('Abaissé');
    const releve = ajustement.startsWith('Relevé');
    // Le niveau de départ se déduit du sens de l'ajustement (un seul cran).
    const niveauInitial = abaisse ? etude.niveau_preuve - 1 : releve ? etude.niveau_preuve + 1 : null;
    const motif = ajustement.replace(/^(Abaissé|Relevé)\s*:\s*/, '');

    return (
      <div>
        <span style={{ ...styleBadge, backgroundColor: couleurs.fond, color: couleurs.texte }}>
          Niveau {etude.niveau_preuve}
          {etude.design_etude ? ` — ${etude.design_etude}` : ''}
        </span>
        {etude.nb_participants && (
          <span style={{ marginLeft: '10px', color: '#555', fontSize: '13px' }}>
            {formaterEffectif(etude.nb_participants)} participants
          </span>
        )}
        {niveauInitial && (
          <div style={{ marginTop: '8px' }}>
            <span
              style={{
                ...styleBadge,
                fontWeight: 'normal',
                backgroundColor: '#F1F1EE',
                color: '#4A4D45',
                border: '1px solid #DCDDD5',
              }}
            >
              ⚠ Niveau ajusté ({niveauInitial} → {etude.niveau_preuve})
            </span>
            {motif && (
              <p style={{ color: '#6B6E63', fontSize: '13px', margin: '4px 0 0' }}>Motif : {motif}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Étude pas encore reclassée : ancien affichage.
  const ancien = ANCIENS_BADGES[etude.niveau_fiabilite];
  return (
    <div>
      {ancien && (
        <span style={{ ...styleBadge, backgroundColor: ancien.fond, color: ancien.texte }}>{ancien.libelle}</span>
      )}
      {(etude.type_etude || etude.nb_participants) && (
        <p style={{ color: '#555', fontSize: '13px', fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' }}>
          {[etude.type_etude, etude.nb_participants ? `${formaterEffectif(etude.nb_participants)} participants` : null]
            .filter(Boolean)
            .join(' • ')}
        </p>
      )}
    </div>
  );
}

// Formulaire de signalement, affiché sous une étude quand le lecteur le demande.
function FormulaireSignalement({ etude, onFermer }) {
  const [type, setType] = useState('');
  const [message, setMessage] = useState('');
  const [nom, setNom] = useState('');
  const [profession, setProfession] = useState('');
  const [email, setEmail] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // champ piège : invisible pour les humains
  const [tokenTurnstile, setTokenTurnstile] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | succes | erreur
  const [retour, setRetour] = useState('');
  const conteneurRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (statut === 'succes') return undefined;
    function afficher() {
      if (!window.turnstile || !conteneurRef.current || widgetRef.current !== null) return;
      widgetRef.current = window.turnstile.render(conteneurRef.current, {
        sitekey: CLE_SITE_TURNSTILE,
        language: 'fr',
        callback: (token) => setTokenTurnstile(token),
        'expired-callback': () => setTokenTurnstile(''),
        'error-callback': () => setTokenTurnstile(''),
      });
    }
    const nettoyer = chargerTurnstile(afficher);
    return () => {
      nettoyer();
      if (window.turnstile && widgetRef.current !== null) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [statut === 'succes']);

  async function envoyer(e) {
    e.preventDefault();
    if (!tokenTurnstile) {
      setStatut('erreur');
      setRetour('Vérification anti-robot en cours. Patientez quelques secondes, puis réessayez.');
      return;
    }
    setStatut('envoi');
    setRetour('');
    try {
      const res = await fetch('/api/signalements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etudeId: etude.id,
          type,
          message,
          nom,
          profession,
          email,
          page: window.location.pathname,
          tokenTurnstile,
          siteWeb,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatut('erreur');
        setRetour(data.erreur || "Le signalement n'a pas pu être envoyé.");
        setTokenTurnstile('');
        if (window.turnstile && widgetRef.current !== null) window.turnstile.reset(widgetRef.current);
        return;
      }
      setStatut('succes');
      setRetour(data.message);
    } catch (err) {
      setStatut('erreur');
      setRetour("Le signalement n'a pas pu être envoyé. Vérifiez votre connexion.");
    }
  }

  const cadre = { marginTop: '12px', padding: '14px', backgroundColor: '#FAFAF7', border: '1px solid #DCDDD5', borderRadius: '8px' };

  if (statut === 'succes') {
    return (
      <div style={cadre}>
        <p style={{ margin: 0, color: '#27500A' }}>{retour}</p>
        <button type="button" onClick={onFermer} style={{ marginTop: '8px', fontSize: '13px', cursor: 'pointer' }}>
          Fermer
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} style={cadre}>
      <p style={{ margin: '0 0 10px', fontSize: '14px' }}>
        <strong>Signaler une erreur ou proposer une correction</strong>
        <br />
        <span style={{ color: '#6B6E63', fontSize: '13px' }}>
          Professionnel de santé ? Indiquez votre profession : vos corrections nous aident à fiabiliser les résumés.
        </span>
      </p>

      <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }} htmlFor={`type-${etude.id}`}>
        Type de problème
      </label>
      <select
        id={`type-${etude.id}`}
        required
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{ ...styleChamp, marginBottom: '10px' }}
      >
        <option value="">Choisir…</option>
        {TYPES_SIGNALEMENT.map((t) => (
          <option key={t.cle} value={t.cle}>{t.libelle}</option>
        ))}
      </select>

      <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }} htmlFor={`message-${etude.id}`}>
        Votre remarque
      </label>
      <textarea
        id={`message-${etude.id}`}
        required
        minLength={10}
        maxLength={3000}
        rows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ ...styleChamp, marginBottom: '10px', resize: 'vertical' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Nom (facultatif)"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={120}
          style={{ ...styleChamp, flex: '1 1 160px' }}
          aria-label="Nom (facultatif)"
        />
        <input
          type="text"
          placeholder="Profession (facultatif)"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          maxLength={120}
          style={{ ...styleChamp, flex: '1 1 160px' }}
          aria-label="Profession (facultatif)"
        />
        <input
          type="email"
          placeholder="E-mail (facultatif, pour vous répondre)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          style={{ ...styleChamp, flex: '1 1 220px' }}
          aria-label="E-mail (facultatif)"
        />
      </div>

      {/* Champ piège : invisible et inaccessible pour les humains, rempli par les robots */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
        <label>
          Ne pas remplir ce champ
          <input type="text" name="site_web" tabIndex={-1} autoComplete="off" value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} />
        </label>
      </div>

      <div ref={conteneurRef} style={{ marginBottom: '10px' }} />

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          type="submit"
          disabled={statut === 'envoi'}
          style={{ padding: '8px 16px', backgroundColor: '#27500A', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          {statut === 'envoi' ? 'Envoi…' : 'Envoyer'}
        </button>
        <button type="button" onClick={onFermer} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '14px' }}>
          Annuler
        </button>
      </div>

      {statut === 'erreur' && <p style={{ color: '#a12c1b', fontSize: '13px', margin: '8px 0 0' }}>{retour}</p>}
    </form>
  );
}

function CarteEtude({ etude }) {
  const [signalementOuvert, setSignalementOuvert] = useState(false);

  return (
    <div
      style={{
        marginBottom: '20px',
        padding: '16px',
        border: '1px solid #eee',
        borderRadius: '8px',
      }}
    >
      <BlocPreuve etude={etude} />

      <strong style={{ display: 'block', marginTop: '10px' }}>{etude.titre_traduit || etude.titre_original}</strong>
      <p style={{ color: '#6B6E63', fontSize: '14px' }}>
        {etude.source} · {etude.date_publication} · {etude.auteurs}
      </p>

      <p><strong>Résumé simplifié :</strong></p>
      <p>{etude.resume_simplifie}</p>

      <p><strong>Résumé reformulé :</strong></p>
      <p>{etude.resume_reformule}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', fontSize: '14px' }}>
        {etude.url_originale && (
          <a href={etude.url_originale} target="_blank" rel="noopener noreferrer">
            Voir l'étude originale →
          </a>
        )}
        {!signalementOuvert && (
          <button
            type="button"
            onClick={() => setSignalementOuvert(true)}
            style={{ background: 'none', border: 'none', padding: 0, color: '#6B6E63', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px' }}
          >
            Signaler une erreur
          </button>
        )}
      </div>

      {signalementOuvert && <FormulaireSignalement etude={etude} onFermer={() => setSignalementOuvert(false)} />}
    </div>
  );
}

export default function ListeEtudes({ etudes }) {
  const [selection, setSelection] = useState([]);
  // Les revues de niveau 5 (narratives et mécanistiques) sont en retrait : masquées par défaut.
  const [afficherRevues, setAfficherRevues] = useState(false);

  const comptes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let nonClassees = 0;
  for (const e of etudes) {
    if (e.niveau_preuve && comptes[e.niveau_preuve] !== undefined) comptes[e.niveau_preuve]++;
    else nonClassees++;
  }

  function basculer(niveau) {
    setSelection((actuelle) =>
      actuelle.includes(niveau) ? actuelle.filter((n) => n !== niveau) : [...actuelle, niveau]
    );
  }

  // Sans filtre : tout sauf le niveau 5, sauf si le lecteur a demandé à voir les revues.
  // Avec filtre : exactement les niveaux choisis (y compris le 5 s'il est sélectionné).
  const visibles =
    selection.length === 0
      ? etudes.filter((e) => e.niveau_preuve !== 5 || afficherRevues)
      : etudes.filter((e) => selection.includes(e.niveau_preuve));

  const boutonRevuesVisible = selection.length === 0 && comptes[5] > 0;

  return (
    <div>
      {/* Avertissement méthodologique : origine des résumés et des niveaux */}
      <p
        style={{
          backgroundColor: '#FAFAF7',
          border: '1px solid #DCDDD5',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '13px',
          color: '#4A4D45',
          margin: '0 0 16px',
        }}
      >
        Ces fiches sont générées par IA à partir des abstracts : elles aident à repérer et trier les
        études, l'étude originale reste la référence.
      </p>

      {/* Résumé chiffré de la répartition par niveau, qui sert aussi de filtre */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ color: '#6B6E63', fontSize: '14px', margin: '0 0 8px' }}>
          Répartition par niveau de preuve (cliquez pour filtrer) ·{' '}
          <a href="/niveaux-de-preuve" style={{ color: '#555' }}>Comprendre les niveaux</a>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setSelection([])}
            aria-pressed={selection.length === 0}
            style={{
              ...styleBadge,
              cursor: 'pointer',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: selection.length === 0 ? '2px solid #333' : '2px solid transparent',
            }}
          >
            Toutes ({etudes.length})
          </button>
          {[1, 2, 3, 4, 5].map((niveau) =>
            comptes[niveau] > 0 ? (
              <button
                key={niveau}
                type="button"
                onClick={() => basculer(niveau)}
                aria-pressed={selection.includes(niveau)}
                style={{
                  ...styleBadge,
                  cursor: 'pointer',
                  backgroundColor: COULEURS_NIVEAUX[niveau].fond,
                  color: COULEURS_NIVEAUX[niveau].texte,
                  border: selection.includes(niveau)
                    ? `2px solid ${COULEURS_NIVEAUX[niveau].texte}`
                    : '2px solid transparent',
                }}
              >
                Niveau {niveau} : {comptes[niveau]}
              </button>
            ) : null
          )}
        </div>
        {nonClassees > 0 && (
          <p style={{ color: '#6B6E63', fontSize: '13px', margin: '8px 0 0' }}>
            {nonClassees} étude{nonClassees > 1 ? 's' : ''} en cours de classement.
          </p>
        )}
      </div>

      {visibles.length === 0 && (
        <p style={{ color: '#6B6E63' }}>
          {selection.length === 0
            ? 'Aucune étude de niveau 1 à 4 pour le moment.'
            : 'Aucune étude pour ce niveau.'}
        </p>
      )}

      {visibles.map((etude) => (
        <CarteEtude key={etude.id} etude={etude} />
      ))}

      {boutonRevuesVisible && (
        <div style={{ marginTop: '8px', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => setAfficherRevues(!afficherRevues)}
            style={{
              padding: '10px 16px',
              backgroundColor: COULEURS_NIVEAUX[5].fond,
              color: COULEURS_NIVEAUX[5].texte,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {afficherRevues
              ? `Masquer les ${comptes[5]} revues narratives et mécanistiques`
              : `Afficher aussi les ${comptes[5]} revues narratives et mécanistiques (niveau 5)`}
          </button>
          {!afficherRevues && (
            <p style={{ color: '#6B6E63', fontSize: '13px', margin: '6px 0 0' }}>
              Synthèses non systématiques ou centrées sur des mécanismes biologiques : utiles pour comprendre un domaine, mais sans nouvelles données mesurées chez l'humain.
            </p>
          )}
        </div>
      )}
      {/* Appel aux professionnels */}
      <div
        style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#EEF2E8',
          borderRadius: '8px',
        }}
      >
        <p style={{ margin: '0 0 10px', fontSize: '15px', color: '#1F2A22' }}>
          <strong>Vous êtes professionnel de santé ou chercheur ?</strong> Aidez-nous à fiabiliser ces
          résumés : relisez, corrigez, signalez. Les relecteurs qui le souhaitent sont crédités sur le site.
        </p>
        <a
          href="/a-propos#relecture"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            backgroundColor: '#27500A',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Devenir relecteur
        </a>
      </div>
    </div>
  );
}
