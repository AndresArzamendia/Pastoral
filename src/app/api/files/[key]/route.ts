import { NextRequest, NextResponse } from 'next/server';
import { r2PublicUrl } from '@/lib/r2';

/**
 * Servicio de archivos del bucket.
 *
 * Antes esta ruta descargaba el objeto de R2 y lo reenviaba por el servidor. Eso
 * costaba una invocación de función y el doble de transferencia por cada imagen
 * que veía un visitante, además de sumar latencia.
 *
 * Ahora solo responde con un redirect a la URL pública de Cloudflare: el
 * navegador baja la imagen directo desde el edge y por el servidor no pasa más
 * que un 307 de unos bytes. El 307 se cachea de forma indefinida porque la
 * relación clave -> URL no cambia nunca, así que en la práctica esta ruta se
 * consulta una sola vez por imagen y por navegador.
 *
 * Sigue siendo la dirección que se usa en las filas de la base que se guardaron
 * antes del cambio, por eso no hace falta migrar nada.
 */
export const dynamic = 'force-dynamic';

const IMMUTABLE = 'public, max-age=31536000, immutable';

export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!key || key.length > 300) return new NextResponse(null, { status: 400 });

  const target = r2PublicUrl(key);
  if (!target) {
    return new NextResponse(null, {
      status: 503,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  return NextResponse.redirect(target, {
    status: 307,
    headers: { 'Cache-Control': IMMUTABLE, 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  return GET(request, ctx);
}
