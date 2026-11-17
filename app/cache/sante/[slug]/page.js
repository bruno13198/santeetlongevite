// Version en cache des pages de problèmes de santé sans filtre (17 nov. 2026). Voir app/cache/aliments/[slug]/page.js.
import PageProbleme, { generateMetadata as metadonneesPage } from '../../../sante/[slug]/page';

export const revalidate = 86400; // 24 heures
export const dynamic = 'force-static';

export function generateStaticParams() {
  return [];
}

const sansFiltre = Promise.resolve({});

export async function generateMetadata({ params }) {
  return metadonneesPage({ params, searchParams: sansFiltre });
}

export default async function PageProblemeEnCache({ params }) {
  return PageProbleme({ params, searchParams: sansFiltre });
}
