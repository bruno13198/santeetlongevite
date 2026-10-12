import { Suspense } from 'react';
import SeDesabonnerContenu from '../components/SeDesabonnerContenu';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Se désabonner des alertes | ScienceTruths',
  robots: { index: false },
};

export default function SeDesabonner() {
  return (
    <Suspense fallback={<main style={{ padding: '40px', textAlign: 'center' }}>Chargement...</main>}>
      <SeDesabonnerContenu />
    </Suspense>
  );
}

