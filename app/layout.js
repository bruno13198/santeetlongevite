export const metadata = {
  title: 'Super Aliments Santé',
  description: 'Études scientifiques sur les aliments et la santé',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
