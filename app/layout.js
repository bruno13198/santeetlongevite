import Footer from './components/Footer';
import CookieConsent from './components/CookieConsent';
import Nav from './components/Nav';

export const metadata = {
  title: 'Super Aliments Santé',
  description: 'Études scientifiques sur les aliments et la santé',
  verification: {
    google: 'bcKpWEIEXZZai9xkX-fSanCo3fa1MoPSvQTDxQ7knFs',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ScienceTruths',
  url: 'https://sciencetruths.com',
  description: 'Études scientifiques sur les aliments et la santé, expliquées simplement.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Nav />
        {children}
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
