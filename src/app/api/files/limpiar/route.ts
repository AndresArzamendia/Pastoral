import { NextResponse } from 'next/server';
import { r2KeyFromUrl } from '@/lib/r2';
import { getFileStorage } from '@/lib/uploadStorage';
import { requireAdminWriter } from '@/lib/requireAdmin';

/**
 * Limpieza por lote de archivos que quedaron sin referencia.
 *
 * El panel llama a esto en cada guardado: compara lo que había con lo que queda
 * y pide borrar lo que desapareció. Va en una sola petición porque, si se mandara
 * una por archivo, un guardado con ocho imágenes reemplazadas serían ocho
 * requests al servidor.
 *
 * Cada dirección se resuelve en el servidor, que es el único que conoce las
 * variables de R2. Las que no son del bucket (data URL embebida en la base, un
 * CDN externo, un video de YouTube) se cuentan aparte y se dejan como están: no
 * son nuestros archivos y borrarlas sería un error.
 */
export const dynamic = 'force-dynamic';

const MAX_URLS = 200;

export async function POST(request: Request) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  let urls: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.urls)) {
      urls = body.urls.filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
    }
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  if (urls.length === 0) return NextResponse.json({ ok: true, borrados: 0, omitidos: 0 });
  if (urls.length > MAX_URLS) urls = urls.slice(0, MAX_URLS);

  const storage = await getFileStorage();
  if (!storage) {
    return NextResponse.json({ error: 'El almacenamiento de archivos no está disponible.' }, { status: 503 });
  }

  let borrados = 0;
  let omitidos = 0;

  for (const url of new Set(urls)) {
    const key = r2KeyFromUrl(url);
    if (!key) {
      omitidos++;
      continue;
    }
    try {
      await storage.delete(key);
      borrados++;
    } catch (error) {
      console.error(`[files] no se pudo borrar ${key}:`, error);
      omitidos++;
    }
  }

  return NextResponse.json({ ok: true, borrados, omitidos, driver: storage.driver });
}
