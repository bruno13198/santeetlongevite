import Script from 'next/script';
import Footer from './components/Footer';

export const metadata = {
  title: 'Super Aliments Santé',
  description: 'Études scientifiques sur les aliments et la santé',
  verification: {
    google: 'bcKpWEIEXZZai9xkX-fSanCo3fa1MoPSvQTDxQ7knFs',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ZPTWSTEHH0"
          strategy="beforeInteractive"
        />
        <Script id="google-analytics" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ZPTWSTEHH0');
          `}
        </Script>
      </head>
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
