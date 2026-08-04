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
      <body>{children}</body>
    </html>
  );
}
