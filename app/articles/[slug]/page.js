import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import styles from './page.module.css';
import './badges.css';
import Disclaimer from '../../components/Disclaimer';
import Breadcrumbs from '../../components/Breadcrumbs';
 
export const dynamic = 'force-dynamic';
 
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
 
function insererBadges(texte) {
  return texte
    .replaceAll('{{A}}', '<span class="badge badge-a">Grade A</span>')
    .replaceAll('{{B}}', '<span class="badge badge-b">Grade B</span>')
    .replaceAll('{{C}}', '<span class="badge badge-c">Grade C</span>')
    .replaceAll('{{D}}', '<span class="badge badge-d">Grade D</span>')
    .replaceAll('{{B–C}}', '<span class="badge badge-b">Grade B</span>–<span class="badge badge-c">Grade C</span>');
}
 
function corrigerImages(texte) {
  return texte.replace(/!\[([^\]]+)\]\s*(https?:\/\/\S+)/g, '![$1]($2)');
}
 
function autoLiens(texte) {
  return texte.replace(
    /(?<!\]\()(?<!["'])(https?:\/\/[^\s)]+)/g,
    '[$1]($1)'
  );
}
 
function convertirTableaux(texte) {
  const lignes = texte.split('\n');
  const resultat = [];
  let i = 0;
  while (i < lignes.length) {
    if (lignes[i].includes('\t')) {
      const bloc = [];
      while (i < lignes.length && lignes[i].includes('\t')) {
        bloc.push(lignes[i]);
        i++;
      }
      if (bloc.length >= 2) {
        const cellules = bloc.map((l) => l.split('\t').map((c) => c.trim()));
        let html = '<table class="tableau-article"><thead><tr>';
        cellules[0].forEach((c) => { html += `<th>${c}</th>`; });
        html += '</tr></thead><tbody>';
        for (let r = 1; r < cellules.length; r++) {
          html += '<tr>';
          cellules[r].forEach((c) => { html += `<td>${c}</td>`; });
          html += '</tr>';
        }
        html += '</tbody></table>';
        resultat.push(html);
      } else {
        resultat.push(...bloc);
      }
    } else {
      resultat.push(lignes[i]);
      i++;
    }
  }
  return resultat.join('\n');
}
 
function preparerContenu(texte) {
  let t = insererBadges(texte);
  t = convertirTableaux(t);
  t = corrigerImages(t);
  t = autoLiens(t);
  return t;
}
 
// Description pour Google (22 oct. 2026) : les ~155 premiers caractères du texte de l'article,
// débarrassés de la mise en forme (titres, gras, liens, badges de grade).
function extraireDescription(contenu) {
  const texte = (contenu || '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_>`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (texte.length <= 155) return texte;
  return texte.slice(0, 155).replace(/\s+\S*$/, '') + '…';
}

// Titre, description et adresse canonique de chaque article (22 oct. 2026)
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data: articles } = await supabase
    .from('articles')
    .select('titre, contenu')
    .eq('slug', slug)
    .eq('publie', true)
    .limit(1);
  const article = articles?.[0];
  if (!article) return { title: 'Article introuvable | ScienceTruths' };

  return {
    title: `${article.titre} | ScienceTruths`,
    description: extraireDescription(article.contenu),
    alternates: { canonical: `https://sciencetruths.com/articles/${slug}` },
  };
}

export default async function FicheArticle({ params }) {
  const { slug } = await params;
  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('publie', true)
    .limit(1);
  const article = articles?.[0];
 
  // Article inexistant ou non publié : vraie page 404.
  if (error || !article) notFound();

// Cherche les articles enfants (si cet article est une famille) ou l'article parent (si c'est un enfant)
  const { data: articlesEnfants } = await supabase
    .from('articles')
    .select('titre, slug')
    .eq('famille_slug', slug)
    .eq('publie', true);

  let articleParent = null;
  if (article.famille_slug) {
    const { data: parents } = await supabase
      .from('articles')
      .select('titre, slug')
      .eq('slug', article.famille_slug)
      .eq('publie', true)
      .limit(1);
    articleParent = parents?.[0] || null;
  }
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.titre,
    datePublished: article.created_at,
    author: {
      '@type': 'Organization',
      name: 'ScienceTruths',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ScienceTruths',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://sciencetruths.com/articles/${slug}`,
    },
  };
 
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.6' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <Breadcrumbs
        items={[
          { nom: 'Accueil', url: 'https://sciencetruths.com' },
          { nom: 'Articles', url: 'https://sciencetruths.com/articles' },
          { nom: article.titre, url: `https://sciencetruths.com/articles/${slug}` },
        ]}
      />
      <Link href="/articles" style={{ color: '#555' }}>← Retour aux articles</Link>
      <h1 style={{ marginTop: '16px' }}>{article.titre}</h1>
      {slug !== 'Pourquoi-ce-site' && (
        <p
          style={{
            margin: '-4px 0 24px',
            padding: '10px 14px',
            border: '1px solid #c9d8bf',
            borderRadius: '8px',
            backgroundColor: '#f4f8ef',
            fontSize: '14px',
          }}
        >
          Recevez chaque semaine les nouvelles études sur ce sujet, avec leur niveau de preuve.{' '}
          <Link href="/veille-scientifique" style={{ fontWeight: 600 }}>
            Choisir mes sujets →
          </Link>
        </p>
      )}
      <div className={`${styles.contenu} article-body`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {preparerContenu(article.contenu)}
        </ReactMarkdown>
      </div>

      {articleParent && (
        <p style={{ marginTop: '24px', fontSize: '14px' }}>
          Cet article fait partie du dossier :{' '}
          <Link href={`/articles/${articleParent.slug}`}>{articleParent.titre}</Link>
        </p>
      )}

      {articlesEnfants && articlesEnfants.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
            Voir aussi dans ce dossier :
          </p>
          <ul style={{ fontSize: '14px' }}>
            {articlesEnfants.map((enfant) => (
              <li key={enfant.slug}>
                <Link href={`/articles/${enfant.slug}`}>{enfant.titre}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer />
    </main>
  );
}
