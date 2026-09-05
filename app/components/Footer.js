import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: '60px',
        padding: '24px 40px',
        borderTop: '1px solid #eee',
        textAlign: 'center',
        fontSize: '13px',
        color: '#999',
      }}
    >
      <div style={{ marginBottom: '12px', opacity: 0.6 }}>
        <Image
          src="/logo-nav.png"
          alt="ScienceTruths"
          width={94}
          height={60}
          style={{ height: '24px', width: 'auto' }}
        />
      </div>
      <Link href="/mentions-legales" style={{ color: '#999', textDecoration: 'none' }}>
        Mentions légales
      </Link>
      {' · '}
      <Link href="/politique-confidentialite" style={{ color: '#999', textDecoration: 'none' }}>
        Politique de confidentialité
      </Link>
      {' · '}
      <a href="mailto:contact@sciencetruths.com" style={{ color: '#999', textDecoration: 'none' }}>
        Contact
      </a>
    </footer>
  );
}
