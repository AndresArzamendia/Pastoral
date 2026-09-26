import { NextRequest, NextResponse } from 'next/server';
import { fetchStoreValue } from '@/lib/supabaseStore';

export const dynamic = 'force-dynamic';

const FALLBACK_PATH = '/favicon-32.png';
const MAX_SIZE = 3_500_000;

const BRAND_CACHE_TTL = 5 * 60 * 1000;
let brandCache: { ts: number; branding: Record<string, string> | null } | null = null;

async function getBranding(): Promise<Record<string, string> | null> {
  const now = Date.now();
  if (brandCache && now - brandCache.ts < BRAND_CACHE_TTL) return brandCache.branding;
  let branding: Record<string, string> | null = null;
  try {
    branding = await fetchStoreValue<Record<string, string>>('branding');
  } catch { /* sin branding configurado */ }
  brandCache = { ts: now, branding };
  return branding;
}

function imageHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
  };
}

function bytesResponse(buffer: Buffer, contentType: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), { headers: imageHeaders(contentType) });
}

async function serveLocal(request: NextRequest, path: string): Promise<NextResponse> {
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(origin + path, { next: { revalidate: 86400 } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return bytesResponse(buf, res.headers.get('content-type') || 'image/png');
    }
  } catch { /* caer al 404 */ }
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=3600' } });
}

export async function GET(request: NextRequest) {
  const branding = await getBranding();
  const logo = (branding?.favLogo as string) || (branding?.androidLogo as string) || (branding?.mainLogo as string) || '';

  // Logo embebido como data:image/*;base64,...
  if (logo.startsWith('data:')) {
    const m = /^data:([^;,]+);(base64)?,([\s\S]*)$/.exec(logo);
    if (m) {
      const contentType = m[1] || 'image/png';
      try {
        const buffer = m[2]
          ? Buffer.from(m[3], 'base64')
          : Buffer.from(decodeURIComponent(m[3]), 'utf8');
        if (buffer.length > 0 && buffer.length <= MAX_SIZE) {
          return bytesResponse(buffer, contentType);
        }
      } catch { /* data URL inválido, seguir al fallback */ }
    }
  }

  // Logo remoto (storage, blob, CDN...) — puede ser una ruta relativa (/api/files/...).
  // Se redirige en lugar de pasar el archivo por el servidor: menos trabajo y la
  // imagen la sirve Cloudflare desde el borde, ya cacheada.
  if (logo) {
    if (logo.startsWith('/')) {
      return NextResponse.redirect(new URL(logo, request.url), 302);
    }
    try {
      const res = await fetch(logo, { next: { revalidate: 3600 } });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length <= MAX_SIZE) {
          return bytesResponse(buf, res.headers.get('content-type') || 'image/png');
        }
      }
    } catch { /* logo inaccesible, caer al fallback */ }
  }

  return serveLocal(request, FALLBACK_PATH);
}