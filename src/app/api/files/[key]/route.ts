import { NextRequest, NextResponse } from 'next/server';
import { r2PublicUrl } from '@/lib/r2';
import { getFileStorage } from '@/lib/uploadStorage';

/**
 * Servicio de archivos del bucket.
 *
 * Hay dos formas de servir, y se elige la más barata disponible:
 *
 *  1. Si el bucket tiene URL pública, se responde con un redirect. El navegador
 *     baja el archivo del edge de Cloudflare y por el servidor no pasa más que
 *     un 307 de unos bytes. Antes esta ruta descargaba el objeto y lo reenviaba:
 *     costaba una invocación de función y el doble de transferencia por cada
 *     imagen que veía un visitante, además de sumar latencia.
 *
 *  2. Si no hay URL pública, se cae al binding de R2 del Worker o a la API S3, y
 *     el archivo se transmite por el servidor. consume más, pero es lo único que
 *     hay cuando el bucket es privado, y hace que la imagen sí se vea.
 *
 * Sigue siendo la dirección guardada en las filas de la base que se escribieron
 * antes de la URL pública, por eso no hace falta migrar nada.
 */

export const dynamic = 'force-dynamic';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const MAX_AGE_DIA = 'public, max-age=86400, immutable';

function noEncontrado(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!key || key.length > 300) return new NextResponse(null, { status: 400 });

  // 1) Redirect al bucket: sin costo de servidor ni transferencia doble.
  const target = r2PublicUrl(key);
  if (target) {
    return NextResponse.redirect(target, {
      status: 307,
      headers: { 'Cache-Control': IMMUTABLE, 'X-Content-Type-Options': 'nosniff' },
    });
  }

  // 2) Bucket privado: se transmite desde el servidor.
  const storage = await getFileStorage();
  if (!storage) return noEncontrado();

  let file;
  try {
    file = await storage.get(key);
  } catch (error) {
    console.error('[files] no se pudo leer el archivo:', error);
    return noEncontrado();
  }
  if (!file?.stream) return noEncontrado();

  const headers: Record<string, string> = {
    'Content-Type': file.contentType,
    'Cache-Control': MAX_AGE_DIA,
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.nextUrl.searchParams.get('dl') === '1' && file.name) {
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(file.name)}"`;
  }

  return new NextResponse(file.stream, { headers });
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!key || key.length > 300) return new NextResponse(null, { status: 400 });

  // Con URL pública no hace falta consultar nada: el redirect ya dice que existe
  // un objeto con esa clave (si no, R2 responde 404 al seguirlo).
  if (r2PublicUrl(key)) {
    return new NextResponse(null, { status: 200, headers: { 'Cache-Control': IMMUTABLE } });
  }

  const storage = await getFileStorage();
  if (!storage) return noEncontrado();
  try {
    const file = await storage.get(key);
    if (!file) return noEncontrado();
    return new NextResponse(null, {
      status: 200,
      headers: { 'Content-Type': file.contentType, 'Cache-Control': MAX_AGE_DIA },
    });
  } catch {
    return noEncontrado();
  }
}
