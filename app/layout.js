import Script from 'next/script';

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
      <body>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-F6HGY41SC6"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-F6HGY41SC6');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
