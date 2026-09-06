import Link from 'next/link';

export default function Breadcrumbs({ items }) {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.nom,
      item: item.url,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <nav aria-label="Fil d'Ariane" style={{ fontSize: '13px', color: '#6B6E63', marginBottom: '16px' }}>
        {items.map((item, index) => (
          <span key={item.url}>
            {index > 0 && ' › '}
            {index === items.length - 1 ? (
              <span>{item.nom}</span>
            ) : (
              <Link href={item.url} style={{ color: '#6B6E63' }}>{item.nom}</Link>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
