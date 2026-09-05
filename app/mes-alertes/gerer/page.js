import { Suspense } from 'react';
import GererAlertesContenu from '../../components/GererAlertesContenu';

export const dynamic = 'force-dynamic';

export default function GererAlertes() {
  return (
    <Suspense fallback={<main style={{ padding: '40px', textAlign: 'center' }}>Chargement...</main>}>
      <GererAlertesContenu />
    </Suspense>
  );
}
