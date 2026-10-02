'use client';

import { useState } from 'react';

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

const styleBadge = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '13px',
  fontWeight: 'bold',
};

function formaterEffectif(n) {
  return Number(n).toLocaleString('fr-FR');
}

function BlocPreuve({ etude }) {
  // Étude reclassée : badge Oxford, effectif, motif d'ajustement.
  if (etude.niveau_preuve) {
    const couleurs = COULEURS_NIVEAUX[etude.niveau_preuve];
    const ajustement = etude.ajustement_preuve || '';
    const fleche = ajustement.startsWith('Abaissé') ? '↓ ' : ajustement.startsWith('Relevé') ? '↑ ' : '';
    return (
      <div>
        <span style={{ ...styleBadge, backgroundColor: couleurs.fond, color: couleurs.texte }}>
          {fleche}Niveau {etude.niveau_preuve}
          {etude.design_etude ? ` — ${etude.design_etude}` : ''}
        </span>
        {etude.nb_participants && (
          <span style={{ marginLeft: '10px', color: '#555', fontSize: '13px' }}>
            {formaterEffectif(etude.nb_participants)} participants
          </span>
        )}
        {ajustement && (
          <p style={{ color: '#6B6E63', fontSize: '13px', margin: '6px 0 0' }}>{ajustement}</p>
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

export default function ListeEtudes({ etudes }) {
  const [selection, setSelection] = useState([]);

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

  const visibles =
    selection.length === 0 ? etudes : etudes.filter((e) => selection.includes(e.niveau_preuve));

  return (
    <div>
      {/* Résumé chiffré de la répartition par niveau, qui sert aussi de filtre */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ color: '#6B6E63', fontSize: '14px', margin: '0 0 8px' }}>
          Répartition par niveau de preuve (cliquez pour filtrer) :
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
        <p style={{ color: '#6B6E63' }}>Aucune étude pour ce niveau.</p>
      )}

      {visibles.map((etude) => (
        <div
          key={etude.id}
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

          {etude.url_originale && (
            <a href={etude.url_originale} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px' }}>
              Voir l'étude originale →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
