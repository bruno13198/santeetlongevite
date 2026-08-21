import Link from 'next/link';
 
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
