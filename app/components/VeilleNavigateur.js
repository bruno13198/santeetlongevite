'use client';

// Navigateur de la veille scientifique (4 oct. 2026) : onglets Aliments / Habitudes,
// recherche qui filtre l'onglet affiché, liste alphabétique avec sommaire des lettres,
// case d'alerte devant chaque sujet, et bandeau d'inscription qui n'apparaît que
// lorsqu'au moins un sujet est coché.
// L'inscription passe par la route existante /api/abonnements (inchangée), avec la même
// protection anti-robots que FormulaireAlertes.js : Cloudflare Turnstile + champ piège.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './VeilleNavigateur.module.css';

const CLE_SITE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const ONGLETS = [
  { cle: 'aliments', libelle: 'Aliments', prefixe: '/aliments', tous: 'Tous les aliments' },
  { cle: 'habitudes', libelle: 'Régimes et habitudes', prefixe: '/habitudes', tous: 'Tous les régimes et habitudes' },
];

function normaliser(texte) {
  return texte
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function singulariser(mot) {
  return mot.endsWith('s') && mot.length > 4 ? mot.slice(0, -1) : mot;
}

// Même logique de recherche que l'ancienne page : tous les mots tapés doivent
// correspondre au début d'un mot du nom (pluriels tolérés).
function correspond(nom, motsRecherche) {
  const motsDuNom = normaliser(nom).split(/[^a-z0-9]+/).filter((m) => m !== '');
  return motsRecherche.every((motRecherche) => {
    if (motRecherche.length <= 3) {
      return motsDuNom.some((mot) => mot === motRecherche || mot.startsWith(motRecherche));
    }
    const motRechercheSing = singulariser(motRecherche);
    return motsDuNom.some((mot) => {
      if (mot.length <= 3) return false;
      const motSing = singulariser(mot);
      return motSing.startsWith(motRechercheSing) || motRechercheSing.startsWith(motSing);
    });
  });
}

function lettreDe(nom) {
  const premiere = normaliser(nom).charAt(0).toUpperCase();
  return /[A-Z]/.test(premiere) ? premiere : '#';
}

function grouperParLettre(liste) {
  const triee = [...liste].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  const groupes = [];
  for (const sujet of triee) {
    const lettre = lettreDe(sujet.nom);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.lettre === lettre) dernier.sujets.push(sujet);
    else groupes.push({ lettre, sujets: [sujet] });
  }
  return groupes;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function VeilleNavigateur({ aliments, habitudes }) {
  const [onglet, setOnglet] = useState('aliments');
  const [recherche, setRecherche] = useState('');

  const [choixAliments, setChoixAliments] = useState(() => new Set());
  const [choixHabitudes, setChoixHabitudes] = useState(() => new Set());
  const [tousLesAliments, setTousLesAliments] = useState(false);
  const [toutesLesHabitudes, setToutesLesHabitudes] = useState(false);

  const [email, setEmail] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // champ piège : invisible pour les humains
  const [tokenTurnstile, setTokenTurnstile] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | succes | erreur
  const [message, setMessage] = useState('');
  const conteneurTurnstileRef = useRef(null);
  const widgetTurnstileRef = useRef(null);

  // Onglet indiqué dans l'adresse (?onglet=habitudes), pour pouvoir partager un lien direct.
  useEffect(() => {
    const parametre = new URLSearchParams(window.location.search).get('onglet');
    if (parametre === 'habitudes') setOnglet('habitudes');
  }, []);

  function changerOnglet(cle) {
    setOnglet(cle);
    const url = new URL(window.location.href);
    if (cle === 'aliments') url.searchParams.delete('onglet');
    else url.searchParams.set('onglet', cle);
    window.history.replaceState(null, '', url.toString());
  }

  const listes = { aliments, habitudes };
  const choix = { aliments: choixAliments, habitudes: choixHabitudes };
  const setChoix = { aliments: setChoixAliments, habitudes: setChoixHabitudes };
  const tous = { aliments: tousLesAliments, habitudes: toutesLesHabitudes };
  const setTous = { aliments: setTousLesAliments, habitudes: setToutesLesHabitudes };

  const motsRecherche = useMemo(
    () => normaliser(recherche).split(/[^a-z0-9]+/).filter((m) => m !== ''),
    [recherche]
  );

  const filtres = useMemo(() => {
    const filtrer = (liste) => (motsRecherche.length === 0 ? liste : liste.filter((s) => correspond(s.nom, motsRecherche)));
    return { aliments: filtrer(aliments), habitudes: filtrer(habitudes) };
  }, [aliments, habitudes, motsRecherche]);

  const groupes = useMemo(
    () => ({ aliments: grouperParLettre(filtres.aliments), habitudes: grouperParLettre(filtres.habitudes) }),
    [filtres]
  );

  function basculer(cleOnglet, id) {
    setStatut('repos');
    setChoix[cleOnglet]((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  // Résumé de la sélection pour le bandeau
  const nomsChoisis = useMemo(() => {
    const noms = [];
    if (tousLesAliments) noms.push('tous les aliments');
    else for (const a of aliments) if (choixAliments.has(a.id)) noms.push(a.nom.split(', ')[0]);
    if (toutesLesHabitudes) noms.push('tous les régimes et habitudes');
    else for (const h of habitudes) if (choixHabitudes.has(h.id)) noms.push(h.nom);
    return noms;
  }, [aliments, habitudes, choixAliments, choixHabitudes, tousLesAliments, toutesLesHabitudes]);

  const bandeauVisible = nomsChoisis.length > 0 || statut === 'succes';
  const afficherTurnstile = bandeauVisible && statut !== 'succes';

  // Contrôle Turnstile : affiché seulement quand le bandeau est visible.
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
          alimentIds: tousLesAliments ? [] : [...choixAliments],
          tousLesAliments,
          habitudeIds: toutesLesHabitudes ? [] : [...choixHabitudes],
          toutesLesHabitudes,
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

      setStatut('succes');
      setMessage(data.message);
      setChoixAliments(new Set());
      setChoixHabitudes(new Set());
      setTousLesAliments(false);
      setToutesLesHabitudes(false);
    } catch (err) {
      setStatut('erreur');
      setMessage("L'inscription n'a pas abouti. Vérifiez votre connexion et réessayez.");
      reinitialiserTurnstile();
    }
  }

  const ongletActif = ONGLETS.find((o) => o.cle === onglet);
  const autreOnglet = ONGLETS.find((o) => o.cle !== onglet);
  const lettresPresentes = new Set(groupes[onglet].map((g) => g.lettre));

  return (
    <div className={`${styles.navigateur} ${bandeauVisible ? styles.avecBandeau : ''}`}>
      <label htmlFor="recherche-veille" className={styles.labelRecherche}>
        Rechercher un aliment ou un régime
      </label>
      <input
        id="recherche-veille"
        type="search"
        placeholder="ex : curcuma, jeûne, lentilles"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className={styles.recherche}
        autoComplete="off"
      />

      <div className={styles.onglets} role="tablist" aria-label="Type de sujet">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            role="tab"
            id={`onglet-${o.cle}`}
            aria-selected={onglet === o.cle}
            aria-controls={`panneau-${o.cle}`}
            className={`${styles.onglet} ${onglet === o.cle ? styles.ongletActif : ''}`}
            onClick={() => changerOnglet(o.cle)}
          >
            {o.libelle}
            <span className={styles.compteur}>{filtres[o.cle].length}</span>
          </button>
        ))}
      </div>

      {motsRecherche.length > 0 && filtres[onglet].length === 0 && (
        <p className={styles.vide}>
          Aucun résultat pour « {recherche} » dans cet onglet.
          {filtres[autreOnglet.cle].length > 0 && (
            <>
              {' '}
              <button type="button" className={styles.lienBouton} onClick={() => changerOnglet(autreOnglet.cle)}>
                Voir les {filtres[autreOnglet.cle].length} résultat(s) dans « {autreOnglet.libelle} »
              </button>
            </>
          )}
        </p>
      )}

      {ONGLETS.map((o) => (
        <section
          key={o.cle}
          id={`panneau-${o.cle}`}
          role="tabpanel"
          aria-labelledby={`onglet-${o.cle}`}
          hidden={onglet !== o.cle}
          className={styles.panneau}
        >
          {motsRecherche.length === 0 && (
            <label className={styles.tous}>
              <input
                type="checkbox"
                checked={tous[o.cle]}
                onChange={(e) => {
                  setStatut('repos');
                  setTous[o.cle](e.target.checked);
                }}
              />
              {o.tous}
            </label>
          )}

          {o.cle === 'aliments' && motsRecherche.length === 0 && (
            <nav className={styles.sommaire} aria-label="Accès par lettre">
              {ALPHABET.map((lettre) =>
                lettresPresentes.has(lettre) ? (
                  <a key={lettre} href={`#${o.cle}-${lettre}`} className={styles.lienLettre}>
                    {lettre}
                  </a>
                ) : (
                  <span key={lettre} className={`${styles.lienLettre} ${styles.lettreVide}`} aria-hidden="true">
                    {lettre}
                  </span>
                )
              )}
            </nav>
          )}

          <div className={`${styles.colonnes} ${tous[o.cle] ? styles.desactive : ''}`}>
            {groupes[o.cle].map((groupe) => (
              <div key={groupe.lettre} className={styles.groupe}>
                {o.cle === 'aliments' && (
                  <h2 id={`${o.cle}-${groupe.lettre}`} className={styles.lettre}>
                    {groupe.lettre}
                  </h2>
                )}
                <ul className={styles.liste}>
                  {groupe.sujets.map((sujet) => {
                    const [principal, ...detail] = sujet.nom.split(', ');
                    return (
                      <li key={sujet.id} className={styles.item}>
                        <input
                          type="checkbox"
                          className={styles.case}
                          checked={tous[o.cle] || choix[o.cle].has(sujet.id)}
                          disabled={tous[o.cle]}
                          onChange={() => basculer(o.cle, sujet.id)}
                          aria-label={`Recevoir les alertes pour ${sujet.nom}`}
                        />
                        <Link href={`${o.prefixe}/${sujet.slug}`} prefetch={false} className={styles.lien}>
                          {principal}
                          {detail.length > 0 && <span className={styles.detail}>, {detail.join(', ')}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}

      {bandeauVisible && (
        <div className={styles.bandeau} role="region" aria-label="Recevoir les alertes">
          {statut === 'succes' ? (
            <div className={styles.bandeauInterieur}>
              <p className={styles.succes}>{message}</p>
              <button type="button" className={styles.fermer} onClick={() => setStatut('repos')}>
                Fermer
              </button>
            </div>
          ) : (
            <form onSubmit={valider} className={styles.bandeauInterieur}>
              <div className={styles.resume}>
                <strong>
                  {nomsChoisis.length} sujet{nomsChoisis.length > 1 ? 's' : ''} sélectionné{nomsChoisis.length > 1 ? 's' : ''}
                </strong>
                <span className={styles.resumeNoms}>
                  {nomsChoisis.slice(0, 3).join(', ')}
                  {nomsChoisis.length > 3 ? ` et ${nomsChoisis.length - 3} autre(s)` : ''}
                </span>
              </div>

              <label htmlFor="email-alertes" className={styles.labelEmail}>
                Votre adresse e-mail
              </label>
              <input
                id="email-alertes"
                type="email"
                required
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.email}
              />

              {/* Champ piège : invisible et inaccessible pour les humains, rempli par les robots */}
              <div aria-hidden="true" className={styles.piege}>
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

              <div ref={conteneurTurnstileRef} className={styles.turnstile} />

              <button type="submit" disabled={statut === 'envoi'} className={styles.valider}>
                {statut === 'envoi' ? 'Envoi en cours...' : 'Recevoir les alertes'}
              </button>

              {statut === 'erreur' && <p className={styles.erreur}>{message}</p>}
              <p className={styles.note}>
                Un e-mail de confirmation vous sera envoyé. Pensez à vérifier vos courriers indésirables.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
