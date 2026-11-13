// Verdicts du sens de l'effet (13 nov. 2026), calculés à partir des seules méta-analyses et
// des essais (niveaux 1 et 2), les « sans objet » étant ignorés.
// Moins de 2 études : preuves insuffisantes. Au moins 60 % dans un sens : verdict dans ce sens.
// Étiquettes sans fond coloré, pour ne pas se confondre avec les couleurs des niveaux de preuve.

export const VERDICTS = {
  favorable: { symbole: '↑', libelle: 'plutôt favorable', couleur: '#27500A' },
  nul: { symbole: '=', libelle: 'pas d\u2019effet démontré', couleur: '#4A4D45' },
  defavorable: { symbole: '↓', libelle: 'plutôt défavorable', couleur: '#A32D2D' },
  partage: { symbole: '±', libelle: 'résultats partagés', couleur: '#854F0B' },
  insuffisant: { symbole: '?', libelle: 'preuves insuffisantes', couleur: '#8A8D85' },
};

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

export function calculerVerdict(c) {
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
