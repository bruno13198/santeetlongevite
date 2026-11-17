// Rafraîchissement des fiches en cache (16 nov. 2026).
// Appel : https://sciencetruths.com/api/rafraichir?cle=LA_CLE_SECRETE
// Vide d'un coup toutes les fiches en cache ; chacune sera recalculée, à jour, à sa prochaine visite.
// Appelé chaque lundi par la veille juste avant les alertes, et utilisable à la main après une
// correction en base. La clé est la variable d'environnement CLE_RAFRAICHISSEMENT (Vercel).
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// Sections déjà mises en cache (les autres seront ajoutées au fur et à mesure).
const SECTIONS_EN_CACHE = ['/cache/aliments/[slug]'];

export async function GET(request) {
  const cle = new URL(request.url).searchParams.get('cle');
  const attendue = process.env.CLE_RAFRAICHISSEMENT;
  if (!attendue || cle !== attendue) {
    return Response.json({ erreur: 'Clé absente ou invalide.' }, { status: 401 });
  }
  for (const section of SECTIONS_EN_CACHE) revalidatePath(section, 'page');
  return Response.json({ ok: true, sections_rafraichies: SECTIONS_EN_CACHE, le: new Date().toISOString() });
}
