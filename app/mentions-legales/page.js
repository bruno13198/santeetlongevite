import Link from 'next/link';
 
export const metadata = {
  title: 'Mentions légales — Super Aliments Santé',
};
 
export default function MentionsLegales() {
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.7' }}>
      <Link href="/" style={{ color: '#555' }}>← Retour à l'accueil</Link>
 
      <h1 style={{ marginTop: '16px' }}>Mentions légales</h1>
 
      <h2>Éditeur du site</h2>
      <p>
        Ce site est édité à titre non professionnel et non commercial, dans le cadre de l'article
        6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique
        (LCEN), qui permet à un éditeur non professionnel de préserver son anonymat.
      </p>
      <p>
        Pour toute question, vous pouvez contacter l'éditeur à l'adresse suivante :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>
 
      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par :<br />
        Vercel Inc.<br />
        340 S Lemon Ave #4133<br />
        Walnut, CA 91789<br />
        États-Unis<br />
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a>
      </p>
 
      <h2>Directeur de la publication</h2>
      <p>
        Le directeur de la publication est l'éditeur du site, joignable à l'adresse indiquée
        ci-dessus.
      </p>
 
      <h2>Propriété intellectuelle</h2>
      <p>
        L'ensemble des contenus présents sur ce site (textes, synthèses, mise en forme) est protégé
        par le droit d'auteur, sauf mention contraire. Les résumés d'études scientifiques
        renvoient systématiquement vers leurs publications originales, dont les droits appartiennent
        à leurs auteurs et éditeurs respectifs.
      </p>
 
      <h2>Absence de finalité médicale</h2>
      <p>
        Les informations publiées sur ce site sont fournies à titre informatif et éducatif
        uniquement. Elles ne constituent en aucun cas un avis médical, un diagnostic ou une
        recommandation de traitement, et ne remplacent pas la consultation d'un professionnel de
        santé qualifié. Voir notre{' '}
        <Link href="/politique-confidentialite" style={{ color: '#555' }}>
          politique de confidentialité
        </Link>{' '}
        pour plus d'informations sur l'utilisation de vos données.
      </p>
 
      <h2>Contact</h2>
      <p>
        Pour toute question relative au site, vous pouvez nous écrire à :{' '}
        <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>
      </p>
 
      <p style={{ color: '#888', fontSize: '13px', marginTop: '40px' }}>
        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </main>
  );
}
