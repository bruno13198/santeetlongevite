'use client';

import { Analytics } from '@vercel/analytics/next';

// 21 nov. 2026 : n'enregistre pas les visites des robots qui exécutent les pages
// (PetalBot, Googlebot…), pour ne compter que les vrais visiteurs.
const ROBOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

// 25 nov. 2026 : certains robots se déguisent en navigateur d'ordinateur avec une version figée et très
// ancienne (par exemple « Edg/101 », sortie en 2022). Sur ordinateur, Chrome et Edge se mettent à jour
// seuls ; la version 109 est la dernière disponible sous Windows 7 et 8.1, on garde donc ces visiteurs-là.
// Les téléphones ne sont pas concernés : un vieux téléphone peut rester bloqué sur une ancienne version.
const VERSION_MINIMALE_ORDINATEUR = 109;

function versionFigeeSurOrdinateur(ua) {
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return false;
  const edge = ua.match(/Edg\/(\d+)/);
  const chrome = ua.match(/Chrome\/(\d+)/);
  const version = edge ? Number(edge[1]) : chrome ? Number(chrome[1]) : null;
  return version !== null && version < VERSION_MINIMALE_ORDINATEUR;
}

function estUnRobot() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // « Cubot » est une marque de téléphone, pas un robot.
  if (ROBOTS.test(ua) && !/cubot/i.test(ua)) return true;
  return versionFigeeSurOrdinateur(ua);
}

export default function AnalyticsSansRobots() {
  return <Analytics beforeSend={(evenement) => (estUnRobot() ? null : evenement)} />;
}
