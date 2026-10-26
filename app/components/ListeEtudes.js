'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Liste des études d'une fiche (21 oct. 2026 : pagination côté serveur).
// Ce composant n'affiche qu'une page de 20 études, déjà filtrée et triée par la base de données
// (fonctions SQL liste_etudes et comptes_etudes, appelées par SectionEtudes). Les filtres, le tri,
// la recherche et les numéros de page sont des liens : chaque page de résultats a sa propre adresse.
const TAILLE_PAGE = 20;

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

const styleLienBouton = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'inherit',
};

function formaterEffectif(n) {
  return Number(n).toLocaleString('fr-FR');
}

// Année seule, pour la ligne compacte (la date complète reste dans le détail).
function annee(date) {
  if (!date) return null;
  const m = String(date).match(/^(\d{4})/);
  return m ? m[1] : null;
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
    // Le niveau de départ se déduit de l'abaissement (un seul cran). Le relèvement est désactivé.
    const niveauInitial = abaisse ? etude.niveau_preuve - 1 : null;
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

// Carte compacte : niveau, titre, année. Les résumés et le détail s'ouvrent au clic.
function CarteEtude({ etude }) {
  const [ouverte, setOuverte] = useState(true);
  const [signalementOuvert, setSignalementOuvert] = useState(false);
  const an = annee(etude.date_publication);

  return (
    <div
      style={{
        marginBottom: '12px',
        padding: '14px 16px',
        border: '1px solid #eee',
        borderRadius: '8px',
      }}
    >
      <BlocPreuve etude={etude} />

      <button
        type="button"
        onClick={() => setOuverte(!ouverte)}
        aria-expanded={ouverte}
        style={{ ...styleLienBouton, display: 'block', marginTop: '10px', textAlign: 'left', color: 'inherit' }}
      >
        <strong style={{ fontSize: '15px' }}>{etude.titre_traduit || etude.titre_original}</strong>
        {an && <span style={{ color: '#6B6E63', fontSize: '13px' }}> · {an}</span>}
      </button>

      <button
        type="button"
        onClick={() => setOuverte(!ouverte)}
        style={{ ...styleLienBouton, marginTop: '6px', color: '#27500A', fontSize: '13px', fontWeight: 600 }}
      >
        {ouverte ? 'Masquer les résumés ▴' : 'Lire les résumés ▾'}
      </button>

      {ouverte && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ color: '#6B6E63', fontSize: '14px', margin: '0 0 10px' }}>
            {[etude.source, etude.date_publication, etude.auteurs].filter(Boolean).join(' · ')}
          </p>

          <p style={{ margin: '0 0 4px' }}><strong>Résumé simplifié :</strong></p>
          <p style={{ marginTop: 0 }}>{etude.resume_simplifie}</p>

          <p style={{ margin: '0 0 4px' }}><strong>Résumé reformulé :</strong></p>
          <p style={{ marginTop: 0 }}>{etude.resume_reformule}</p>

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
                style={{ ...styleLienBouton, color: '#6B6E63', textDecoration: 'underline', fontSize: '13px' }}
              >
                Signaler une erreur
              </button>
            )}
          </div>

          {signalementOuvert && <FormulaireSignalement etude={etude} onFermer={() => setSignalementOuvert(false)} />}
        </div>
      )}
    </div>
  );
}

// Construit l'adresse d'une page de résultats à partir des paramètres actuels et de modifications.
function construireLien(chemin, parametres, modifications) {
  const p = { ...parametres, ...modifications };
  const recherche = new URLSearchParams();
  if (p.niveau) recherche.set('niveau', String(p.niveau));
  if (p.revues) recherche.set('revues', '1');
  if (p.tri === 'ancien') recherche.set('tri', 'ancien');
  if (p.q) recherche.set('q', p.q);
  if (p.probleme) recherche.set('probleme', p.probleme);
  if (p.page && p.page > 1) recherche.set('page', String(p.page));
  const chaine = recherche.toString();
  return `${chemin}${chaine ? `?${chaine}` : ''}#etudes`;
}

// Numéros de page à afficher : 1 … 4 5 [6] 7 8 … 50
function numerosDePage(pageActuelle, nbPages) {
  const numeros = new Set([1, nbPages, pageActuelle - 2, pageActuelle - 1, pageActuelle, pageActuelle + 1, pageActuelle + 2]);
  const liste = [...numeros].filter((n) => n >= 1 && n <= nbPages).sort((a, b) => a - b);
  const resultat = [];
  for (let i = 0; i < liste.length; i++) {
    if (i > 0 && liste[i] - liste[i - 1] > 1) resultat.push('…');
    resultat.push(liste[i]);
  }
  return resultat;
}

const styleLienPage = {
  display: 'inline-block',
  minWidth: '34px',
  padding: '6px 10px',
  margin: '0 4px 6px 0',
  textAlign: 'center',
  border: '1px solid #ddd',
  borderRadius: '6px',
  textDecoration: 'none',
  color: '#333',
  fontSize: '14px',
};

export default function ListeEtudes({ etudes, comptes, totalSelection, parametres, chemin, problemes = [] }) {
  const { niveau, revues, tri, q, page, probleme } = parametres;
  const nomProbleme = problemes.find((p) => p.slug === probleme)?.nom || '';
  const nbPages = Math.max(1, Math.ceil(totalSelection / TAILLE_PAGE));
  const nonClassees = comptes[0] || 0;
  const totalSansFiltre = [0, 1, 2, 3, 4, 5].reduce((s, n) => s + (comptes[n] || 0), 0);
  const boutonRevuesVisible = !niveau && (comptes[5] || 0) > 0;

  return (
    <div id="etudes">
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
        études, l'étude originale reste la référence. Seules les études menées chez l'homme sont
        retenues : les résultats obtenus sur des cellules ou des animaux ne se confirment le plus
        souvent pas chez l'homme.{' '}
        <a href="/niveaux-de-preuve#ce-que-nous-retenons" style={{ color: '#4A4D45' }}>
          Notre méthode →
        </a>
      </p>

      {/* Recherche dans les études de la fiche */}
      <form method="get" action={chemin} style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {niveau ? <input type="hidden" name="niveau" value={niveau} /> : null}
        {tri === 'ancien' ? <input type="hidden" name="tri" value="ancien" /> : null}
        {probleme ? <input type="hidden" name="probleme" value={probleme} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q || ''}
          placeholder="Rechercher dans ces études (ex : grossesse, cancer)"
          aria-label="Rechercher dans les études de cette fiche"
          style={{ ...styleChamp, flex: '1 1 240px' }}
        />
        <button
          type="submit"
          style={{ padding: '8px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#27500A', color: '#fff', cursor: 'pointer', fontSize: '14px' }}
        >
          Rechercher
        </button>
        {q ? (
          <Link href={construireLien(chemin, parametres, { q: '', page: 1 })} style={{ alignSelf: 'center', fontSize: '13px', color: '#555' }}>
            Effacer la recherche
          </Link>
        ) : null}
      </form>

      {/* 27 oct. 2026 : filtre par problème de santé (menu qui change l'adresse de la page) */}
      {problemes.length > 0 && (
        <form method="get" action={chemin} style={{ marginBottom: '14px', fontSize: '14px' }}>
          {niveau ? <input type="hidden" name="niveau" value={niveau} /> : null}
          {tri === 'ancien' ? <input type="hidden" name="tri" value="ancien" /> : null}
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <label style={{ color: '#4A4D45' }}>
            Problème de santé :{' '}
            <select
              name="probleme"
              defaultValue={probleme || ''}
              onChange={(e) => e.target.form.requestSubmit()}
              style={{ ...styleChamp, display: 'inline-block', width: 'auto', maxWidth: '100%' }}
            >
              <option value="">Tous les problèmes de santé</option>
              {problemes.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.nom} ({p.nb})
                </option>
              ))}
            </select>
          </label>
          <noscript>
            <button type="submit" style={{ marginLeft: '8px' }}>Filtrer</button>
          </noscript>
        </form>
      )}

      {/* Répartition par niveau de preuve, qui sert aussi de filtre */}
      <div style={{ marginBottom: '16px' }}>
        <p style={{ color: '#6B6E63', fontSize: '14px', margin: '0 0 8px' }}>
          {q ? <>Résultats pour « {q} » · </> : null}
          {nomProbleme ? <>{nomProbleme} · </> : null}
          Répartition par niveau de preuve (cliquez pour filtrer) ·{' '}
          <a href="/niveaux-de-preuve" style={{ color: '#555' }}>Comprendre les niveaux</a>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Link
            href={construireLien(chemin, parametres, { niveau: null, page: 1 })}
            aria-current={!niveau ? 'true' : undefined}
            style={{
              ...styleBadge,
              textDecoration: 'none',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: !niveau ? '2px solid #333' : '2px solid transparent',
            }}
          >
            Toutes ({totalSansFiltre})
          </Link>
          {[1, 2, 3, 4, 5].map((n) =>
            (comptes[n] || 0) > 0 ? (
              <Link
                key={n}
                href={construireLien(chemin, parametres, { niveau: niveau === n ? null : n, page: 1 })}
                aria-current={niveau === n ? 'true' : undefined}
                style={{
                  ...styleBadge,
                  textDecoration: 'none',
                  backgroundColor: COULEURS_NIVEAUX[n].fond,
                  color: COULEURS_NIVEAUX[n].texte,
                  border: niveau === n ? `2px solid ${COULEURS_NIVEAUX[n].texte}` : '2px solid transparent',
                }}
              >
                Niveau {n} : {comptes[n]}
              </Link>
            ) : null
          )}
        </div>
        {nonClassees > 0 && (
          <p style={{ color: '#6B6E63', fontSize: '13px', margin: '8px 0 0' }}>
            {nonClassees} étude{nonClassees > 1 ? 's' : ''} en cours de classement.
          </p>
        )}
      </div>

      {/* Tri */}
      <p style={{ fontSize: '13px', color: '#555', margin: '0 0 14px' }}>
        Trier :{' '}
        {tri === 'ancien' ? (
          <>
            <Link href={construireLien(chemin, parametres, { tri: 'recent', page: 1 })} style={{ color: '#555' }}>plus récentes d'abord</Link>
            {' · '}<strong>plus anciennes d'abord</strong>
          </>
        ) : (
          <>
            <strong>plus récentes d'abord</strong>
            {' · '}<Link href={construireLien(chemin, parametres, { tri: 'ancien', page: 1 })} style={{ color: '#555' }}>plus anciennes d'abord</Link>
          </>
        )}
      </p>

      {etudes.length === 0 && (
        <p style={{ color: '#6B6E63' }}>
          {q || probleme ? 'Aucune étude ne correspond à ces filtres.' : niveau ? 'Aucune étude pour ce niveau.' : 'Aucune étude de niveau 1 à 4 pour le moment.'}
        </p>
      )}

      {etudes.map((etude) => (
        <CarteEtude key={etude.id} etude={etude} />
      ))}

      {/* Pagination numérotée */}
      {nbPages > 1 && (
        <nav aria-label="Pages de résultats" style={{ margin: '8px 0 24px' }}>
          {page > 1 && (
            <Link href={construireLien(chemin, parametres, { page: page - 1 })} style={styleLienPage} aria-label="Page précédente">‹</Link>
          )}
          {numerosDePage(page, nbPages).map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} style={{ ...styleLienPage, border: 'none' }}>…</span>
            ) : n === page ? (
              <span key={n} aria-current="page" style={{ ...styleLienPage, backgroundColor: '#27500A', color: '#fff', borderColor: '#27500A' }}>{n}</span>
            ) : (
              <Link key={n} href={construireLien(chemin, parametres, { page: n })} style={styleLienPage}>{n}</Link>
            )
          )}
          {page < nbPages && (
            <Link href={construireLien(chemin, parametres, { page: page + 1 })} style={styleLienPage} aria-label="Page suivante">›</Link>
          )}
          <p style={{ fontSize: '13px', color: '#6B6E63', margin: '4px 0 0' }}>
            Page {page} sur {nbPages} · {totalSelection} étude{totalSelection > 1 ? 's' : ''}
          </p>
        </nav>
      )}

      {boutonRevuesVisible && (
        <div style={{ marginTop: '8px', marginBottom: '24px' }}>
          <Link
            href={construireLien(chemin, parametres, { revues: !revues, page: 1 })}
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              backgroundColor: COULEURS_NIVEAUX[5].fond,
              color: COULEURS_NIVEAUX[5].texte,
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {revues
              ? `Masquer les ${comptes[5]} revues narratives et mécanistiques`
              : `Afficher aussi les ${comptes[5]} revues narratives et mécanistiques (niveau 5)`}
          </Link>
          {!revues && (
            <p style={{ color: '#6B6E63', fontSize: '13px', margin: '6px 0 0' }}>
              Synthèses non systématiques ou centrées sur des mécanismes biologiques : utiles pour comprendre un domaine, mais sans nouvelles données mesurées chez l'homme.
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
