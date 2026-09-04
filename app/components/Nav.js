import Link from 'next/link';
import styles from './Nav.module.css';

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.wrap}>
        <ul className={styles.left}>
          <li><Link href="/" className={styles.link}>Accueil</Link></li>
          <li><Link href="/articles" className={styles.link}>Articles</Link></li>
          <li><Link href="/veille-scientifique" className={styles.link}>Veille scientifique</Link></li>
          <li><Link href="/mes-alertes" className={styles.link}>Alertes</Link></li>
        </ul>
        <ul className={styles.right}>
          <li><Link href="/a-propos" className={styles.link}>À propos</Link></li>
          <li><Link href="/articles/Pourquoi-ce-site" className={styles.link}>Pourquoi ce site</Link></li>
        </ul>
      </div>
    </nav>
  );
}
