import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import styles from './page.module.css';
import './badges.css';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function FicheArticle({ params }) {
  const { slug } = await params;
  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('publie', true)
    .single();
  if (error || !article) {
    return (
      <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
        <p>Article introuvable.</p>
        <Link href="/articles">← Retour aux articles</Link>
      </main>
    );
  }
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto', lineHeight: '1.6' }}>
      <Link href="/articles" style={{ color: '#555' }}>← Retour aux articles</Link>
      <h1 style={{ marginTop: '16px' }}>{article.titre}</h1>
      <div className={styles.contenu}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {article.contenu}
        </ReactMarkdown>
      </div>
    </main>
  );
}
