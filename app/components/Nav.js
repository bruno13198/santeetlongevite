import Link from 'next/link';
import Image from 'next/image';
import styles from './Nav.module.css';

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.wrap}>
        <div className={styles.leftGroup}>
          <Link href="/" className={styles.logoLink} aria-label="ScienceTruths - Accueil">
            <Image
              src="/logo-nav.png"
              alt="ScienceTruths"
              width={188}
              height={120}
              priority
            />
          </Link>
          <ul className={styles.left}>
            <li><Link href="/" className={styles.link}>Accueil</Link></li>
            {/* 26 nov. 2026 : « Articles » remplacé par « L'étude de la semaine » (les articles restent en ligne) */}
            <li><Link href="/etude-de-la-semaine" className={styles.link}>L'étude de la semaine</Link></li>
            <li><Link href="/veille-scientifique" className={styles.link}>Veille scientifique</Link></li>
            {/* 21 oct. 2026 : entrée par problème de santé */}
            <li><Link href="/sante" className={styles.link}>Problèmes de santé</Link></li>
          </ul>
        </div>
        <ul className={styles.right}>
          <li><Link href="/a-propos" className={styles.link}>À propos</Link></li>
          {/* 26 nov. 2026 : adresse en minuscules (évite la redirection automatique) */}
          <li><Link href="/articles/pourquoi-ce-site" className={styles.link}>Pourquoi ce site</Link></li>
        </ul>
      </div>
    </nav>
  );
}
