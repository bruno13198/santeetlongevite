// Redirection des adresses contenant des majuscules vers la même adresse en minuscules (28 oct. 2026).
// Ex. : /articles/Bacopa-memoire-... → /articles/bacopa-memoire-... (redirection permanente 301).
// Ne touche ni aux routes d'API, ni aux fichiers internes de Next.js, ni aux fichiers statiques (images, favicon…).
import { NextResponse } from 'next/server';

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname !== pathname.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
