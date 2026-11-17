// Version en cache des fiches aliments sans filtre (16 nov. 2026).
// Les visites de /aliments/[slug] SANS paramètre (niveau, tri, problème, recherche, page…) sont
// aiguillées ici par next.config.mjs, sans que l'adresse change pour le visiteur. Cette page
// réutilise exactement la fiche normale, mais sans lire l'adresse : Vercel peut donc la garder
// en mémoire au lieu de la recalculer à chaque visite.
// Elle est recalculée au plus une fois par jour, et vidée à la demande par /api/rafraichir
// (appelé chaque lundi par la veille, juste avant l'envoi des alertes).
import FicheAliment, { generateMetadata as metadonneesFiche } from '../../../aliments/[slug]/page';

export const revalidate = 86400; // 24 heures
export const dynamic = 'force-static';

// Aucune fiche préparée à l'avance : chacune est calculée à sa première visite, puis gardée.
export function generateStaticParams() {
  return [];
}

const sansFiltre = Promise.resolve({});

export async function generateMetadata({ params }) {
  return metadonneesFiche({ params, searchParams: sansFiltre });
}

export default async function FicheAlimentEnCache({ params }) {
  return FicheAliment({ params, searchParams: sansFiltre });
}
