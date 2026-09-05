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
            <li><Link href="/articles" className={styles.link}>Articles</Link></li>
            <li><Link href="/veille-scientifique" className={styles.link}>Veille scientifique</Link></li>
            <li><Link href="/mes-alertes" className={styles.link}>Alertes</Link></li>
          </ul>
        </div>
        <ul className={styles.right}>
          <li><Link href="/a-propos" className={styles.link}>À propos</Link></li>
          <li><Link href="/articles/Pourquoi-ce-site" className={styles.link}>Pourquoi ce site</Link></li>
        </ul>
      </div>
    </nav>
  );
}
