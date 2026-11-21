'use client';

import { Analytics } from '@vercel/analytics/next';

// 21 nov. 2026 : n'enregistre pas les visites des robots qui exécutent les pages
// (PetalBot, Googlebot…), pour ne compter que les vrais visiteurs.
const ROBOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

function estUnRobot() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // « Cubot » est une marque de téléphone, pas un robot.
  return ROBOTS.test(ua) && !/cubot/i.test(ua);
}

export default function AnalyticsSansRobots() {
  return <Analytics beforeSend={(evenement) => (estUnRobot() ? null : evenement)} />;
}
