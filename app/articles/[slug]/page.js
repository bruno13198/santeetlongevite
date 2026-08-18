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

function insererBadges(texte) {
  return texte
    .replaceAll('{{A}}', '<span class="badge badge-a">Grade A</span>')
    .replaceAll('{{B}}', '<span class="badge badge-b">Grade B</span>')
    .replaceAll('{{C}}', '<span class="badge badge-c">Grade C</span>')
    .replaceAll('{{D}}', '<span class="badge badge-d">Grade D</span>')
    .replaceAll('{{B–C}}', '<span class="badge badge-b">Grade B</span>–<span class="badge badge-c">Grade C</span>');
}

function corrigerImages(texte) {
  // Ajoute les parenthèses manquantes autour des URL d'images collées depuis Word
  return texte.replace(/!\[([^\]]+)\]\s*(https?:\/\/\S+)/g, '![$1]($2)');
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
  return t;
}

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
          {preparerContenu(article.contenu)}
        </ReactMarkdown>
      </div>
    </main>
  );
}
