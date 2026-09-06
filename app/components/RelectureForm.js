'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function RelectureForm() {
  const [formData, setFormData] = useState({
    profession: '',
    formation: '',
    domaine: '',
    motivation: '',
    email: '',
  });
  const [siteWeb, setSiteWeb] = useState(''); // piège à robots, doit rester vide
  const [statut, setStatut] = useState('idle'); // idle | envoi | succes | erreur

  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Piège à robots : ce champ est invisible pour un humain (caché en CSS),
    // seuls les robots automatisés le remplissent. S'il est rempli, on ignore
    // silencieusement la soumission sans révéler qu'elle a été bloquée.
    if (siteWeb) {
      setStatut('succes');
      return;
    }

    setStatut('envoi');

    const { error } = await supabase.from('candidatures_relecture').insert([formData]);

    if (error) {
      setStatut('erreur');
    } else {
      setStatut('succes');
    }
  }

  if (statut === 'succes') {
    return (
      <p style={{ fontStyle: 'italic' }}>
        Merci pour votre candidature. Nous reviendrons vers vous rapidement.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
      <input
        type="text"
        name="site_web"
        value={siteWeb}
        onChange={(e) => setSiteWeb(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
        aria-hidden="true"
      />
      <label>
        Profession / spécialité
        <input
          type="text"
          name="profession"
          required
          value={formData.profession}
          onChange={handleChange}
          style={{ width: '100%', padding: '10px', marginTop: '4px' }}
        />
      </label>

      <label>
        Formation
        <input
          type="text"
          name="formation"
          required
          value={formData.formation}
          onChange={handleChange}
          style={{ width: '100%', padding: '10px', marginTop: '4px' }}
        />
      </label>

      <label>
        Domaine d'expertise
        <input
          type="text"
          name="domaine"
          required
          value={formData.domaine}
          onChange={handleChange}
          style={{ width: '100%', padding: '10px', marginTop: '4px' }}
        />
      </label>

      <label>
        Pourquoi souhaitez-vous participer ?
        <textarea
          name="motivation"
          required
          rows={4}
          value={formData.motivation}
          onChange={handleChange}
          style={{ width: '100%', padding: '10px', marginTop: '4px' }}
        />
      </label>

      <label>
        Adresse email
        <input
          type="email"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          style={{ width: '100%', padding: '10px', marginTop: '4px' }}
        />
      </label>

      <button
        type="submit"
        disabled={statut === 'envoi'}
        style={{ padding: '12px', fontWeight: '600', cursor: 'pointer' }}
      >
        {statut === 'envoi' ? 'Envoi...' : 'Envoyer ma candidature'}
      </button>

      {statut === 'erreur' && (
        <p style={{ color: '#b00020' }}>
          Une erreur est survenue. Vous pouvez aussi nous écrire directement à{' '}
          <a href="mailto:contact@sciencetruths.com">contact@sciencetruths.com</a>.
        </p>
      )}

      <p style={{ fontSize: '13px', color: '#888' }}>
        Les informations transmises via ce formulaire sont utilisées uniquement pour étudier votre
        candidature et ne sont partagées avec aucun tiers.
      </p>
    </form>
  );
}
