import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Protection anti-robots (2 oct. 2026) : champ piège + vérification Cloudflare Turnstile,
// AVANT toute écriture en base et tout envoi d'e-mail.
// 11 oct. 2026 : troisième type de sujet, « nutriment » (nutriments, compléments, plantes).
// 22 oct. 2026 : deux nouveaux types. « substance » (case « Tous les additifs et contaminants »,
// séparée de « Tous les aliments ») et « probleme » (problèmes de santé).
async function verifierTurnstile(token, ip) {
  if (!token || !process.env.TURNSTILE_SECRET_KEY) return false;
  try {
    const parametres = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) parametres.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parametres,
    });
    const resultat = await res.json();
    return resultat.success === true;
  } catch (e) {
    console.error('Erreur vérification Turnstile:', e.message);
    return false;
  }
}

// Construit les lignes d'abonnement d'un type : une seule ligne « tous » (sujet_id null)
// ou une ligne par sujet choisi.
function lignesPourType(email, typeSujet, tous, ids) {
  if (tous) return [{ email, type_sujet: typeSujet, sujet_id: null }];
  return ids.map((id) => ({ email, type_sujet: typeSujet, sujet_id: id }));
}

export async function POST(request) {
  try {
    const {
      email,
      alimentIds,
      tousLesAliments,
      toutesLesSubstances,
      habitudeIds,
      toutesLesHabitudes,
      nutrimentIds,
      tousLesNutriments,
      problemeIds,
      tousLesProblemes,
      tokenTurnstile,
      siteWeb,
    } = await request.json();

    // Champ piège rempli : c'est un robot. On répond comme si tout allait bien, sans rien faire.
    if (siteWeb) {
      return Response.json({ message: 'Vérifiez votre boîte mail pour confirmer vos alertes.' });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const humainVerifie = await verifierTurnstile(tokenTurnstile, ip);
    if (!humainVerifie) {
      return Response.json(
        { erreur: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.' },
        { status: 400 }
      );
    }

    if (!email) {
      return Response.json({ erreur: 'Email requis.' }, { status: 400 });
    }

    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
      return Response.json({ erreur: 'Adresse email invalide.' }, { status: 400 });
    }

    const listeAliments = Array.isArray(alimentIds) ? alimentIds : [];
    const listeHabitudes = Array.isArray(habitudeIds) ? habitudeIds : [];
    const listeNutriments = Array.isArray(nutrimentIds) ? nutrimentIds : [];
    const listeProblemes = Array.isArray(problemeIds) ? problemeIds : [];

    // Les additifs et contaminants choisis un à un restent des abonnements « aliment » (ce sont des
    // fiches de la table aliments) ; seule la case « Tous » a son propre type, « substance ».
    const lignesAInserer = [
      ...lignesPourType(email, 'aliment', tousLesAliments, listeAliments),
      ...(toutesLesSubstances ? [{ email, type_sujet: 'substance', sujet_id: null }] : []),
      ...lignesPourType(email, 'habitude_alimentaire', toutesLesHabitudes, listeHabitudes),
      ...lignesPourType(email, 'nutriment', tousLesNutriments, listeNutriments),
      ...lignesPourType(email, 'probleme', tousLesProblemes, listeProblemes),
    ];

    // Avec « Tous les aliments » coché, les additifs choisis un à un arrivent aussi dans alimentIds :
    // on les garde, puisque « Tous les aliments » ne couvre plus les additifs.
    if (tousLesAliments && listeAliments.length > 0) {
      lignesAInserer.push(...listeAliments.map((id) => ({ email, type_sujet: 'aliment', sujet_id: id })));
    }

    if (lignesAInserer.length === 0) {
      return Response.json(
        { erreur: 'Sélectionnez au moins un sujet à suivre.' },
        { status: 400 }
      );
    }

    let nombreCrees = 0;
    let nombreReactives = 0;
    let premierToken = null;

    for (const ligne of lignesAInserer) {
      let requeteExistant = supabase
        .from('abonnements')
        .select('id, actif, confirme, token_confirmation')
        .eq('email', ligne.email)
        .eq('type_sujet', ligne.type_sujet);

      requeteExistant = ligne.sujet_id === null
        ? requeteExistant.is('sujet_id', null)
        : requeteExistant.eq('sujet_id', ligne.sujet_id);

      const { data: existant } = await requeteExistant.maybeSingle();

      if (existant) {
        if (!existant.actif) {
          await supabase.from('abonnements').update({ actif: true }).eq('id', existant.id);
        }

        if (!existant.confirme) {
          nombreCrees++;
          if (!premierToken) premierToken = existant.token_confirmation;
        } else if (!existant.actif) {
          nombreReactives++;
        }
      } else {
        const { data: nouvelle, error } = await supabase
          .from('abonnements')
          .insert({ ...ligne, actif: true })
          .select('id, token_confirmation, confirme')
          .single();

        if (error) {
          console.error('Erreur insertion abonnement:', error.message);
          continue;
        }

        nombreCrees++;
        if (!premierToken) premierToken = nouvelle.token_confirmation;
      }
    }

    if (nombreCrees === 0 && nombreReactives === 0) {
      return Response.json({ message: 'Ces abonnements sont déjà actifs et confirmés pour cet email.' });
    }

    if (nombreCrees === 0 && nombreReactives > 0) {
      return Response.json({ message: 'Vos alertes ont été réactivées avec succès.' });
    }

    const lienConfirmation = `https://sciencetruths.com/api/abonnements/confirmer-tout?email=${encodeURIComponent(email)}&token=${premierToken}`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'ScienceTruths', email: 'alertes@sciencetruths.com' },
        to: [{ email }],
        subject: 'Confirmez vos alertes ScienceTruths',
        htmlContent: `
          <p>Bonjour,</p>
          <p>Vous avez demandé à recevoir des alertes par email sur ScienceTruths.</p>
          <p>Pour confirmer votre inscription, cliquez sur ce lien :</p>
          <p><a href="${lienConfirmation}">Confirmer mes alertes</a></p>
          <p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
          <p style="font-size: 13px; color: #888;">Si vous ne trouvez pas cet email la prochaine fois, pensez à vérifier vos spams / courriers indésirables.</p>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Erreur envoi email Brevo:', errText);
      return Response.json({ erreur: 'Erreur lors de l\'envoi de l\'email.' }, { status: 500 });
    }

    return Response.json({ message: 'Vérifiez votre boîte mail pour confirmer vos alertes.' });
  } catch (e) {
    console.error('Erreur route abonnements:', e.message);
    return Response.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
