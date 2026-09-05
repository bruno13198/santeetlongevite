import { Suspense } from 'react';
import GererAlertesContenu from '../../components/GererAlertesContenu';

export default function GererAlertes() {
  return (
    <Suspense fallback={<main style={{ padding: '40px', textAlign: 'center' }}>Chargement...</main>}>
      <GererAlertesContenu />
    </Suspense>
  );
}
