import { redirect } from 'next/navigation';

// 12 oct. 2026 : l'inscription aux alertes et la demande du lien de gestion se font
// désormais sur /veille-scientifique. Cette ancienne adresse (liens des e-mails déjà
// envoyés) y renvoie. La page /mes-alertes/gerer, elle, reste en place.
export default function MesAlertes() {
  redirect('/veille-scientifique#gerer-alertes');
}
