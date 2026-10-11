import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vérifie un lien de gestion et renvoie les abonnements actifs de l'adresse.
// 11 oct. 2026 : gère les trois types de sujets (aliments, régimes et habitudes, nutriments)
// et renvoie pour chacun son type, son nom et son slug.
const SUJETS_PAR_TYPE = {
  aliment: { table: 'aliments', prefixe: 'aliments', tous: 'Tous les aliments' },
  habitude_alimentaire: { table: 'habitudes_alimentaires', prefixe: 'habitudes', tous: 'Tous les régimes et habitudes' },
  nutriment: { table: 'nutriments', prefixe: 'nutriments', tous: 'Tous les nutriments et compléments' },
};

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return Response.json({ valide: false });

    const { data: lien, error: erreurLien } = await supabase
      .from('liens_magiques')
      .select('email, date_expiration')
      .eq('token', token)
      .maybeSingle();

    if (erreurLien || !lien || new Date(lien.date_expiration) < new Date()) {
      return Response.json({ valide: false });
    }

    const { data: abonnements, error: erreurAbonnements } = await supabase
      .from('abonnements')
      .select('id, type_sujet, sujet_id')
      .eq('email', lien.email)
      .eq('actif', true);

    if (erreurAbonnements) {
      console.error('Erreur lecture abonnements:', erreurAbonnements.message);
      return Response.json({ valide: false });
    }

    // Noms et slugs des sujets précis, type par type
    const infosParType = {};
    for (const [type, config] of Object.entries(SUJETS_PAR_TYPE)) {
      const ids = [...new Set((abonnements || []).filter((a) => a.type_sujet === type && a.sujet_id).map((a) => a.sujet_id))];
      infosParType[type] = {};
      if (ids.length > 0) {
        const { data: sujets } = await supabase.from(config.table).select('id, nom, slug').in('id', ids);
        for (const s of sujets || []) infosParType[type][s.id] = s;
      }
    }

    const ORDRE = ['aliment', 'habitude_alimentaire', 'nutriment'];
    const resultat = (abonnements || [])
      .filter((a) => SUJETS_PAR_TYPE[a.type_sujet])
      .map((a) => {
        const config = SUJETS_PAR_TYPE[a.type_sujet];
        if (!a.sujet_id) {
          return { id: a.id, type_sujet: a.type_sujet, tous: true, nom: config.tous, url: null };
        }
        const sujet = infosParType[a.type_sujet][a.sujet_id];
        return {
          id: a.id,
          type_sujet: a.type_sujet,
          tous: false,
          nom: sujet ? sujet.nom : 'Sujet supprimé',
          url: sujet ? `/${config.prefixe}/${sujet.slug}` : null,
        };
      })
      .sort(
        (x, y) =>
          ORDRE.indexOf(x.type_sujet) - ORDRE.indexOf(y.type_sujet) ||
          Number(y.tous) - Number(x.tous) ||
          x.nom.localeCompare(y.nom, 'fr', { sensitivity: 'base' })
      );

    return Response.json({ valide: true, email: lien.email, abonnements: resultat });
  } catch (e) {
    console.error('Erreur route lien-magique/verifier:', e.message);
    return Response.json({ valide: false });
  }
}
