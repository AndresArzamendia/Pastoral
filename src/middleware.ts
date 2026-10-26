import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Seguridad HTTP
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.vaticannews.va https://va.ec.app; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://pub-833cb34bd1494d27b0b8ae2b177aaa35.r2.dev https://rtqzphmqnsaxirifdzvu.supabase.co; connect-src 'self' https://rtqzphmqnsaxirifdzvu.supabase.co; frame-src https://www.vaticannews.va; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
  );

  if (request.nextUrl.pathname === '/favicon.ico') {
    return NextResponse.redirect(new URL('/favicon-32.png', request.url), 301);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|android-chrome-.*\\.png|apple-touch-icon\\.png|favicon-.*\\.png|splash-logo.*|logo.*\\.png|.*\\.svg|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.ico).*)',
  ],
};
