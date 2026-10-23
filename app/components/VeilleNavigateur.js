'use client';

// Navigateur de la veille scientifique (4 oct. 2026) : onglets Aliments / Habitudes / Nutriments (10 oct.)
// / Additifs et contaminants (17 oct. : fiches de la table aliments de ces deux catégories),
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
  // Nutriments (10 oct. 2026), alertes ajoutées le 11 oct.
  { cle: 'nutriments', libelle: 'Nutriments et compléments', prefixe: '/nutriments', tous: 'Tous les nutriments et compléments' },
  // Additifs et contaminants (17 oct. 2026) : ce sont des fiches de la table aliments (même pipeline),
  // affichées dans un onglet à part. 22 oct. 2026 : case « Tous » indépendante (abonnement de type
  // « substance ») ; « Tous les aliments » ne les inclut plus.
  { cle: 'additifs', libelle: 'Additifs et contaminants', prefixe: '/aliments', tous: 'Tous les additifs et contaminants' },
];

// Sections de l'onglet Additifs et contaminants (colonne categorie de la table aliments).
const SECTIONS_SUBSTANCES = [
  { cle: 'Additifs alimentaires', libelle: 'Additifs' },
  { cle: 'Contaminants alimentaires', libelle: 'Contaminants' },
];
const CATEGORIES_SUBSTANCES = new Set(SECTIONS_SUBSTANCES.map((s) => s.cle));

// Sections de l'onglet Nutriments, dans l'ordre d'affichage (colonne categorie de la table nutriments).
const SECTIONS_NUTRIMENTS = [
  { cle: 'nutriment', libelle: 'Nutriments' },
  { cle: 'complement', libelle: 'Compléments' },
  { cle: 'plante', libelle: 'Plantes' },
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

// Tri sur le nom principal (avant la première virgule), puis sur le nom complet :
// « Ail, cru » passe avant « Ail noir » et « Ail séché ».
function trier(liste) {
  const comparer = (x, y) => x.localeCompare(y, 'fr', { sensitivity: 'base' });
  return [...liste].sort(
    (a, b) => comparer(a.nom.split(', ')[0], b.nom.split(', ')[0]) || comparer(a.nom, b.nom)
  );
}

function grouperParLettre(liste) {
  const triee = trier(liste);
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

export default function VeilleNavigateur({ aliments, habitudes, nutriments = [] }) {
  const [onglet, setOnglet] = useState('aliments');
  const [recherche, setRecherche] = useState('');

  const [choixAliments, setChoixAliments] = useState(() => new Set());
  const [choixHabitudes, setChoixHabitudes] = useState(() => new Set());
  const [tousLesAliments, setTousLesAliments] = useState(false);
  const [toutesLesHabitudes, setToutesLesHabitudes] = useState(false);
  const [choixNutriments, setChoixNutriments] = useState(() => new Set());
  const [tousLesNutriments, setTousLesNutriments] = useState(false);
  const [tousLesSubstances, setTousLesSubstances] = useState(false);

  const [email, setEmail] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // champ piège : invisible pour les humains
  const [tokenTurnstile, setTokenTurnstile] = useState('');
  const [statut, setStatut] = useState('repos'); // repos | envoi | succes | erreur
  const [message, setMessage] = useState('');
  const conteneurTurnstileRef = useRef(null);
  const widgetTurnstileRef = useRef(null);

  // Onglet indiqué dans l'adresse (?onglet=habitudes ou ?onglet=nutriments), pour pouvoir partager un lien direct.
  useEffect(() => {
    const parametre = new URLSearchParams(window.location.search).get('onglet');
    if (parametre === 'habitudes' || parametre === 'nutriments' || parametre === 'additifs') setOnglet(parametre);
  }, []);

  function changerOnglet(cle) {
    setOnglet(cle);
    const url = new URL(window.location.href);
    if (cle === 'aliments') url.searchParams.delete('onglet');
    else url.searchParams.set('onglet', cle);
    window.history.replaceState(null, '', url.toString());
  }

  // Les additifs sont des aliments en base : ils partagent la sélection et la case « Tous les aliments ».
  const alimentsSeuls = useMemo(() => aliments.filter((a) => !CATEGORIES_SUBSTANCES.has(a.categorie)), [aliments]);
  const additifs = useMemo(() => aliments.filter((a) => CATEGORIES_SUBSTANCES.has(a.categorie)), [aliments]);

  const choix = { aliments: choixAliments, habitudes: choixHabitudes, nutriments: choixNutriments, additifs: choixAliments };
  const setChoix = { aliments: setChoixAliments, habitudes: setChoixHabitudes, nutriments: setChoixNutriments, additifs: setChoixAliments };
  const tous = { aliments: tousLesAliments, habitudes: toutesLesHabitudes, nutriments: tousLesNutriments, additifs: tousLesSubstances };
  const setTous = { aliments: setTousLesAliments, habitudes: setToutesLesHabitudes, nutriments: setTousLesNutriments, additifs: setTousLesSubstances };
  const idsSubstances = useMemo(() => new Set(additifs.map((a) => a.id)), [additifs]);

  const motsRecherche = useMemo(
    () => normaliser(recherche).split(/[^a-z0-9]+/).filter((m) => m !== ''),
    [recherche]
  );

  const filtres = useMemo(() => {
    const filtrer = (liste) => (motsRecherche.length === 0 ? liste : liste.filter((s) => correspond(s.nom, motsRecherche)));
    return {
      aliments: filtrer(alimentsSeuls),
      habitudes: filtrer(habitudes),
      nutriments: filtrer(nutriments),
      additifs: filtrer(additifs),
    };
  }, [alimentsSeuls, habitudes, nutriments, additifs, motsRecherche]);

  // Aliments : groupés par lettre. Habitudes : une seule liste, répartie à parts égales
  // entre les colonnes (pas de lettres, trop peu d'entrées par lettre).
  const groupes = useMemo(
    () => ({
      aliments: grouperParLettre(filtres.aliments),
      habitudes: filtres.habitudes.length > 0 ? [{ lettre: 'tout', sujets: trier(filtres.habitudes) }] : [],
      // Nutriments : une section par catégorie (nutriments, compléments, plantes).
      nutriments: SECTIONS_NUTRIMENTS.map((section) => ({
        lettre: section.cle,
        titre: section.libelle,
        sujets: trier(filtres.nutriments.filter((n) => n.categorie === section.cle)),
      })).filter((section) => section.sujets.length > 0),
      // Additifs et contaminants : une section par catégorie, comme les nutriments.
      additifs: SECTIONS_SUBSTANCES.map((section) => ({
        lettre: section.cle,
        titre: section.libelle,
        sujets: trier(filtres.additifs.filter((a) => a.categorie === section.cle)),
      })).filter((section) => section.sujets.length > 0),
    }),
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
    else for (const a of alimentsSeuls) if (choixAliments.has(a.id)) noms.push(a.nom.split(', ')[0]);
    if (tousLesSubstances) noms.push('tous les additifs et contaminants');
    else for (const a of additifs) if (choixAliments.has(a.id)) noms.push(a.nom.split(', ')[0]);
    if (toutesLesHabitudes) noms.push('tous les régimes et habitudes');
    else for (const h of habitudes) if (choixHabitudes.has(h.id)) noms.push(h.nom);
    if (tousLesNutriments) noms.push('tous les nutriments et compléments');
    else for (const n of nutriments) if (choixNutriments.has(n.id)) noms.push(n.nom);
    return noms;
  }, [alimentsSeuls, additifs, habitudes, nutriments, choixAliments, choixHabitudes, choixNutriments, tousLesAliments, toutesLesHabitudes, tousLesNutriments, tousLesSubstances]);

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
          // Fiches choisies une à une, sauf celles déjà couvertes par une case « Tous »
          alimentIds: [...choixAliments].filter((id) =>
            idsSubstances.has(id) ? !tousLesSubstances : !tousLesAliments
          ),
          tousLesAliments,
          toutesLesSubstances: tousLesSubstances,
          habitudeIds: toutesLesHabitudes ? [] : [...choixHabitudes],
          toutesLesHabitudes,
          nutrimentIds: tousLesNutriments ? [] : [...choixNutriments],
          tousLesNutriments,
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
      setChoixNutriments(new Set());
      setTousLesNutriments(false);
      setTousLesSubstances(false);
    } catch (err) {
      setStatut('erreur');
      setMessage("L'inscription n'a pas abouti. Vérifiez votre connexion et réessayez.");
      reinitialiserTurnstile();
    }
  }

  const ongletActif = ONGLETS.find((o) => o.cle === onglet);
  // Premier autre onglet qui a des résultats pour la recherche en cours.
  const autreOnglet = ONGLETS.find((o) => o.cle !== onglet && filtres[o.cle].length > 0) || ONGLETS.find((o) => o.cle !== onglet);
  const lettresPresentes = new Set(groupes[onglet].map((g) => g.lettre));

  return (
    <div className={`${styles.navigateur} ${bandeauVisible ? styles.avecBandeau : ''}`}>
      <label htmlFor="recherche-veille" className={styles.labelRecherche}>
        Rechercher un aliment, un régime, un nutriment, un additif ou un contaminant
      </label>
      <input
        id="recherche-veille"
        type="search"
        placeholder="ex : curcuma, jeûne, magnésium"
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
          {motsRecherche.length === 0 && o.tous && (
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

          {o.cle === 'nutriments' || o.cle === 'additifs' ? (
            groupes[o.cle].map((section) => (
              <div key={section.lettre}>
                <h2 className={styles.lettre}>
                  {section.titre} ({section.sujets.length})
                </h2>
                <ul className={`${styles.liste} ${styles.colonnes} ${styles.groupeLibre} ${tous[o.cle] ? styles.desactive : ''}`}>
                  {section.sujets.map((sujet) => (
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
                        {sujet.nom}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
          <div className={`${styles.colonnes} ${tous[o.cle] ? styles.desactive : ''}`}>
            {groupes[o.cle].map((groupe) => (
              <div key={groupe.lettre} className={o.cle === 'aliments' ? styles.groupe : styles.groupeLibre}>
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
          )}
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
                Un e-mail le lundi, sans compte. Votre adresse n'est jamais revendue, et vous pouvez vous
                désabonner en un clic. Un e-mail de confirmation vous sera envoyé : pensez à vérifier vos
                courriers indésirables.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
