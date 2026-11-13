// Carte des preuves d'une fiche (27 oct. 2026), composant serveur sans JavaScript côté lecteur.
// 1. Un camembert (anneau) : la répartition des études de la fiche par niveau de preuve.
// 2. Un tableau : une ligne par problème de santé, une colonne par niveau de preuve ; chaque case
//    renvoie vers la liste filtrée (problème + niveau). 27 oct. 2026 : le nom du problème renvoie vers
//    sa page /sante/[slug] (liens internes utiles au référencement), et une colonne « Total » filtre la
//    liste sur ce problème. Le tableau n'apparaît pas sur les pages de
//    problème de santé, ni quand la fiche a trop peu d'études classées.
// 13 nov. 2026 : sous chaque problème, le verdict des méta-analyses et des essais (niveaux 1 et 2),
//    calculé à partir du sens de l'effet de chaque étude (fonction SQL verdicts_sujet). Étiquette sans
//    fond coloré, pour ne pas se confondre avec les couleurs des niveaux de preuve.
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Couleurs franches pour le camembert, et couleurs des badges (identiques aux fiches) pour le tableau.
const COULEURS_GRAPHIQUE = { 1: '#2E7D32', 2: '#8BC34A', 3: '#F2B33D', 4: '#E07A45', 5: '#90A4AE' };
const COULEURS_NIVEAUX = {
  1: { fond: '#C0DD97', texte: '#173404' },
  2: { fond: '#EAF3DE', texte: '#27500A' },
  3: { fond: '#FAEEDA', texte: '#633806' },
  4: { fond: '#FAECE7', texte: '#712B13' },
  5: { fond: '#E4E9EE', texte: '#34495E' },
};
const LIBELLES = {
  1: 'Niveau 1 · méta-analyses d\u2019essais',
  2: 'Niveau 2 · essais randomisés',
  3: 'Niveau 3 · cohortes, petits essais',
  4: 'Niveau 4 · études transversales, cas',
  5: 'Niveau 5 · revues narratives et mécanistiques',
};
const SEUIL_TABLEAU = 10; // études classées par problème de santé, au minimum
const LIGNES_VISIBLES = 10;

// Verdicts : symbole, libellé et couleur du texte (pas de fond, pour ne pas imiter les niveaux).
const VERDICTS = {
  favorable: { symbole: '↑', libelle: 'plutôt favorable', couleur: '#27500A' },
  nul: { symbole: '=', libelle: 'pas d\u2019effet démontré', couleur: '#4A4D45' },
  defavorable: { symbole: '↓', libelle: 'plutôt défavorable', couleur: '#A32D2D' },
  partage: { symbole: '±', libelle: 'résultats partagés', couleur: '#854F0B' },
  insuffisant: { symbole: '?', libelle: 'preuves insuffisantes', couleur: '#8A8D85' },
};

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

// Verdict d'un problème à partir des études de niveau 1 et 2 (les « sans objet » sont ignorés).
// Moins de 2 études : preuves insuffisantes. Au moins 60 % dans un sens : verdict dans ce sens.
function calculerVerdict(c) {
  const fav = c?.favorable || 0;
  const nul = c?.nul || 0;
  const def = c?.defavorable || 0;
  const mit = c?.mitige || 0;
  const n = fav + nul + def + mit;
  if (n < 2) {
    return {
      cle: 'insuffisant',
      detail:
        n === 1
          ? 'Une seule méta-analyse ou un seul essai : trop peu pour conclure.'
          : 'Aucune méta-analyse ni aucun essai : trop peu pour conclure.',
    };
  }
  let cle = 'partage';
  if (fav / n >= 0.6) cle = 'favorable';
  else if (def / n >= 0.6) cle = 'defavorable';
  else if (nul / n >= 0.6) cle = 'nul';
  const morceaux = [];
  if (fav) morceaux.push(pluriel(fav, 'favorable'));
  if (nul) morceaux.push(`${nul} sans effet`);
  if (def) morceaux.push(pluriel(def, 'défavorable'));
  if (mit) morceaux.push(pluriel(mit, 'partagée'));
  return { cle, detail: `Méta-analyses et essais : ${morceaux.join(', ')}.` };
}

function Camembert({ comptes, chemin }) {
  const total = [1, 2, 3, 4, 5].reduce((s, n) => s + (comptes[n] || 0), 0);
  if (total === 0) return null;

  let decalage = 25; // départ en haut du cercle
  const parts = [1, 2, 3, 4, 5]
    .filter((n) => (comptes[n] || 0) > 0)
    .map((n) => {
      const pourcentage = (comptes[n] / total) * 100;
      const part = { n, pourcentage, decalage };
      decalage -= pourcentage;
      return part;
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', margin: '8px 0 20px' }}>
      <svg viewBox="0 0 42 42" width="140" height="140" role="img" aria-label="Répartition des études par niveau de preuve">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f0f0f0" strokeWidth="7" />
        {parts.map((p) => (
          <circle
            key={p.n}
            cx="21"
            cy="21"
            r="15.915"
            fill="none"
            stroke={COULEURS_GRAPHIQUE[p.n]}
            strokeWidth="7"
            strokeDasharray={`${p.pourcentage} ${100 - p.pourcentage}`}
            strokeDashoffset={p.decalage}
          />
        ))}
        <text x="21" y="21" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#222">{total}</text>
        <text x="21" y="27" textAnchor="middle" fontSize="3.2" fill="#6B6E63">études</text>
      </svg>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', lineHeight: 1.9 }}>
        {[1, 2, 3, 4, 5].map((n) =>
          (comptes[n] || 0) > 0 ? (
            <li key={n}>
              {/* 8 nov. 2026 : chaque ligne de la légende filtre la liste sur ce niveau */}
              <Link
                href={`${chemin}?niveau=${n}#etudes`}
                title={`Afficher les ${comptes[n]} études de niveau ${n}`}
                style={{ color: '#222', textDecoration: 'underline', textDecorationColor: '#ccc', textUnderlineOffset: '3px' }}
              >
                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COULEURS_GRAPHIQUE[n], marginRight: '8px' }} />
                {LIBELLES[n]} : <strong>{comptes[n]}</strong> ({Math.round((comptes[n] / total) * 100)} %)
              </Link>
            </li>
          ) : null
        )}
      </ul>
    </div>
  );
}

// 13 nov. 2026 : étiquette de verdict, dépliable au clic (détail des décomptes), bulle au survol.
function EtiquetteVerdict({ verdict }) {
  if (!verdict) return null;
  const v = VERDICTS[verdict.cle];
  return (
    <details style={{ marginTop: '3px' }}>
      <summary
        title={verdict.detail}
        style={{
          display: 'inline-block',
          listStyle: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          padding: '1px 7px',
          border: '1px solid #DCDDD5',
          borderRadius: '6px',
          color: v.couleur,
        }}
      >
        {v.symbole} {v.libelle}
      </summary>
      <span style={{ display: 'block', fontSize: '12px', color: '#6B6E63', marginTop: '3px' }}>{verdict.detail}</span>
    </details>
  );
}

function LigneProbleme({ ligne, chemin }) {
  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', fontWeight: 'normal', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
        {/* 8 nov. 2026 : le nom filtre la fiche sur ce problème ; la flèche mène à la page du problème de santé */}
        <Link
          href={`${chemin}?probleme=${ligne.slug}#etudes`}
          title={`Afficher les ${ligne.total} études de cette fiche sur ${ligne.nom.toLowerCase()}`}
          style={{ color: '#27500A' }}
        >
          {ligne.nom}
        </Link>
        <Link
          href={`/sante/${ligne.slug}`}
          title={`Toutes les études du site sur ${ligne.nom.toLowerCase()}`}
          aria-label={`Toutes les études du site sur ${ligne.nom.toLowerCase()}`}
          style={{ marginLeft: '6px', color: '#6B6E63', textDecoration: 'none', fontSize: '13px' }}
        >
          →
        </Link>
        <EtiquetteVerdict verdict={ligne.verdict} />
      </th>
      <td style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
        <Link
          href={`${chemin}?probleme=${ligne.slug}#etudes`}
          title={`Afficher les ${ligne.total} études de cette fiche sur ${ligne.nom.toLowerCase()}`}
          style={{ display: 'inline-block', minWidth: '28px', padding: '2px 6px', borderRadius: '10px', border: '1px solid #ccc', color: '#333', fontWeight: 'bold', fontSize: '13px', textDecoration: 'none' }}
        >
          {ligne.total}
        </Link>
      </td>
      {[1, 2, 3, 4, 5].map((n) => {
        const nb = ligne.niveaux[n] || 0;
        return (
          <td key={n} style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
            {nb > 0 ? (
              <Link
                href={`${chemin}?probleme=${ligne.slug}&niveau=${n}#etudes`}
                title={`${nb} étude${nb > 1 ? 's' : ''} de niveau ${n} sur ${ligne.nom.toLowerCase()}`}
                style={{
                  display: 'inline-block',
                  minWidth: '28px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  backgroundColor: COULEURS_NIVEAUX[n].fond,
                  color: COULEURS_NIVEAUX[n].texte,
                  fontWeight: 'bold',
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                {nb}
              </Link>
            ) : (
              <span style={{ color: '#ccc' }}>·</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export default async function CartePreuves({ type, sujetId, chemin, comptes }) {
  let lignes = [];
  if (type !== 'probleme') {
    const [{ data }, { data: verdicts }] = await Promise.all([
      supabase.rpc('carte_preuves', { p_type: type, p_sujet: sujetId }),
      supabase.rpc('verdicts_sujet', { p_type: type, p_sujet: sujetId }),
    ]);
    const verdictParSlug = new Map((verdicts || []).map((v) => [v.slug, v]));
    const parProbleme = new Map();
    for (const r of data || []) {
      if (!parProbleme.has(r.slug)) parProbleme.set(r.slug, { slug: r.slug, nom: r.nom, niveaux: {}, total: 0 });
      const ligne = parProbleme.get(r.slug);
      ligne.niveaux[r.niveau] = Number(r.nb);
      ligne.total += Number(r.nb);
    }
    lignes = [...parProbleme.values()].sort((a, b) => b.total - a.total);
    // En cas d'erreur de lecture des verdicts, le tableau s'affiche simplement sans eux.
    if (verdicts) {
      for (const ligne of lignes) ligne.verdict = calculerVerdict(verdictParSlug.get(ligne.slug));
    }
  }
  const totalClasse = lignes.reduce((s, l) => s + l.total, 0);
  const afficherTableau = lignes.length >= 2 && totalClasse >= SEUIL_TABLEAU;

  const enTete = (
    <thead>
      <tr>
        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '13px', color: '#6B6E63', fontWeight: 'normal' }}>Problème de santé</th>
        <th style={{ padding: '6px 4px', fontSize: '13px', color: '#333' }}>Total</th>
        {[1, 2, 3, 4, 5].map((n) => (
          <th key={n} style={{ padding: '6px 4px', fontSize: '13px', color: COULEURS_NIVEAUX[n].texte }}>Niv. {n}</th>
        ))}
      </tr>
    </thead>
  );

  return (
    <section style={{ margin: '8px 0 24px' }}>
      <h3 style={{ fontSize: '17px', margin: '0 0 4px' }}>Carte des preuves</h3>
      <Camembert comptes={comptes} chemin={chemin} />

      {afficherTableau && (
        <>
          <p style={{ fontSize: '13px', color: '#6B6E63', margin: '0 0 8px' }}>
            Nombre d'études par problème de santé et par niveau de preuve. Cliquez sur un problème ou sur un
            nombre pour afficher ces études dans la liste ci-dessous, ou sur la flèche → pour voir toutes les
            études du site sur ce problème. Une même étude peut concerner plusieurs problèmes de santé.{' '}
            <span style={{ color: '#333' }}>
              Sous chaque problème, le verdict des méta-analyses et des essais (niveaux 1 et 2) : cliquez
              dessus pour le détail.
            </span>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px', minWidth: '460px' }}>
              {enTete}
              <tbody>
                {lignes.slice(0, LIGNES_VISIBLES).map((ligne) => (
                  <LigneProbleme key={ligne.slug} ligne={ligne} chemin={chemin} />
                ))}
              </tbody>
            </table>
            {lignes.length > LIGNES_VISIBLES && (
              <details style={{ marginTop: '6px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#27500A' }}>
                  Voir les {lignes.length - LIGNES_VISIBLES} autres problèmes de santé
                </summary>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px', minWidth: '460px' }}>
                  <tbody>
                    {lignes.slice(LIGNES_VISIBLES).map((ligne) => (
                      <LigneProbleme key={ligne.slug} ligne={ligne} chemin={chemin} />
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
          {/* 13 nov. 2026 : avertissement sur les verdicts */}
          <p style={{ fontSize: '12px', color: '#8A8D85', margin: '8px 0 0' }}>
            Verdicts établis automatiquement à partir des résumés. Les études qui trouvent un effet sont plus
            souvent publiées que les autres : un verdict favorable reste à confirmer.
          </p>
        </>
      )}
    </section>
  );
}
