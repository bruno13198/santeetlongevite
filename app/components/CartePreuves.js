// Carte des preuves d'une fiche (27 oct. 2026), composant serveur sans JavaScript côté lecteur.
// 1. Un camembert (anneau) : la répartition des études de la fiche par niveau de preuve.
// 2. Un tableau : une ligne par problème de santé, une colonne par niveau de preuve ; chaque case
//    renvoie vers la liste filtrée (problème + niveau). Le tableau n'apparaît pas sur les pages de
//    problème de santé, ni quand la fiche a trop peu d'études classées.
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
  5: 'Niveau 5 · revues narratives',
};
const SEUIL_TABLEAU = 10; // études classées par problème de santé, au minimum
const LIGNES_VISIBLES = 10;

function Camembert({ comptes }) {
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
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COULEURS_GRAPHIQUE[n], marginRight: '8px' }} />
              {LIBELLES[n]} : <strong>{comptes[n]}</strong> ({Math.round((comptes[n] / total) * 100)} %)
            </li>
          ) : null
        )}
      </ul>
    </div>
  );
}

function LigneProbleme({ ligne, chemin }) {
  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', fontWeight: 'normal', padding: '6px 8px', borderBottom: '1px solid #f0f0f0' }}>
        <Link href={`${chemin}?probleme=${ligne.slug}#etudes`} style={{ color: '#27500A' }}>{ligne.nom}</Link>
      </th>
      {[1, 2, 3, 4, 5].map((n) => {
        const nb = ligne.niveaux[n] || 0;
        return (
          <td key={n} style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid #f0f0f0' }}>
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
    const { data } = await supabase.rpc('carte_preuves', { p_type: type, p_sujet: sujetId });
    const parProbleme = new Map();
    for (const r of data || []) {
      if (!parProbleme.has(r.slug)) parProbleme.set(r.slug, { slug: r.slug, nom: r.nom, niveaux: {}, total: 0 });
      const ligne = parProbleme.get(r.slug);
      ligne.niveaux[r.niveau] = Number(r.nb);
      ligne.total += Number(r.nb);
    }
    lignes = [...parProbleme.values()].sort((a, b) => b.total - a.total);
  }
  const totalClasse = lignes.reduce((s, l) => s + l.total, 0);
  const afficherTableau = lignes.length >= 2 && totalClasse >= SEUIL_TABLEAU;

  const enTete = (
    <thead>
      <tr>
        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '13px', color: '#6B6E63', fontWeight: 'normal' }}>Problème de santé</th>
        {[1, 2, 3, 4, 5].map((n) => (
          <th key={n} style={{ padding: '6px 4px', fontSize: '13px', color: COULEURS_NIVEAUX[n].texte }}>Niv. {n}</th>
        ))}
      </tr>
    </thead>
  );

  return (
    <section style={{ margin: '8px 0 24px' }}>
      <h3 style={{ fontSize: '17px', margin: '0 0 4px' }}>Carte des preuves</h3>
      <Camembert comptes={comptes} />

      {afficherTableau && (
        <>
          <p style={{ fontSize: '13px', color: '#6B6E63', margin: '0 0 8px' }}>
            Nombre d'études par problème de santé et par niveau de preuve. Cliquez sur un nombre pour afficher
            ces études. Une même étude peut concerner plusieurs problèmes de santé.
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
        </>
      )}
    </section>
  );
}
