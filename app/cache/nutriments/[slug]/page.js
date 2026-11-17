// Version en cache des fiches nutriments sans filtre (17 nov. 2026). Voir app/cache/aliments/[slug]/page.js.
import FicheNutriment, { generateMetadata as metadonneesFiche } from '../../../nutriments/[slug]/page';

export const revalidate = 86400; // 24 heures
export const dynamic = 'force-static';

export function generateStaticParams() {
  return [];
}

const sansFiltre = Promise.resolve({});

export async function generateMetadata({ params }) {
  return metadonneesFiche({ params, searchParams: sansFiltre });
}

export default async function FicheNutrimentEnCache({ params }) {
  return FicheNutriment({ params, searchParams: sansFiltre });
}
