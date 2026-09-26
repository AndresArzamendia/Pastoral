import { NextRequest, NextResponse } from 'next/server';
import { fetchStoreValue } from '@/lib/supabaseStore';
import { r2PublicBaseUrl, r2PublicUrl, r2KeyFromUrl } from '@/lib/r2';

/**
 * Favicon dinámico: siempre el logo del panel (favLogo > androidLogo > mainLogo).
 *
 * Se resuelve en el servidor para TODOS los visitantes, sin depender del
 * localStorage de cada dispositivo.
 *
 * El logo se entrega con un redirect a la URL pública de R2 en vez de pasar los
 * bytes por acá: el navegador lo baja del edge de Cloudflare y esta ruta no
 * gasta ancho de banda ni invoca una función por cada visita. La respuesta se
 * cachea en el CDN porque el logo cambia muy pocas veces.
 */

export const dynamic = 'force-dynamic';

const FALLBACK_PATH = '/favicon-32.png';
const MAX_SIZE = 3_500_000;

const BRAND_CACHE_TTL = 5 * 60 * 1000;
const CDN_CACHE = 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400';

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
    'Cache-Control': CDN_CACHE,
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

/** Si el logo apunta al bucket, se devuelve la dirección pública para saltar el /api/files. */
function directR2Url(logo: string): string {
  if (logo.startsWith('/api/files/')) {
    const key = r2KeyFromUrl(logo);
    return key ? r2PublicUrl(key) : '';
  }
  if (logo.startsWith('/')) return '';
  const base = r2PublicBaseUrl();
  if (base && logo.startsWith(base + '/')) return logo;
  return '';
}

export async function GET(request: NextRequest) {
  const branding = await getBranding();
  const logo = (branding?.favLogo as string) || (branding?.androidLogo as string) || (branding?.mainLogo as string) || '';

  // Logo embebido como data:image/*;base64,... — no hay nada a dónde redirigir.
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

  if (logo) {
    // Imagen que ya vive en un CDN o en el bucket: el navegador la baja de ahí.
    const direct = directR2Url(logo) || (/^https?:\/\//i.test(logo) ? logo : '');
    if (direct) {
      return NextResponse.redirect(direct, { status: 302, headers: { 'Cache-Control': CDN_CACHE } });
    }
  }

  return serveLocal(request, FALLBACK_PATH);
}
