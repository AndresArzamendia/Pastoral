import { NextResponse } from 'next/server';
import { r2KeyFromUrl } from '@/lib/r2';
import { getFileStorage } from '@/lib/uploadStorage';
import { requireAdminWriter } from '@/lib/requireAdmin';

/**
 * Borra un archivo del bucket a partir de la dirección que está guardada.
 *
 * Se envía la URL y no la clave porque el navegador no tiene las variables de R2:
 * la clave se resuelve acá, en el servidor, que sí las conoce. Así el panel puede
 * limpiar los archivos que ya tenía guardados, estén apuntando a /api/files/...
 * (los antiguos) o a la URL pública del bucket (los nuevos).
 *
 * Solo borra objetos del bucket. Las imágenes que están embebidas en la base de
 * datos como data URL se van solas con la fila que las contenía, y las URLs
 * externas a las que apuntan no son nuestras.
 */
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  let url = '';
  try {
    const body = await request.json();
    url = typeof body?.url === 'string' ? body.url : '';
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  if (!url) return NextResponse.json({ error: 'Falta la dirección del archivo.' }, { status: 400 });

  const key = r2KeyFromUrl(url);
  if (!key) {
    // No es un archivo nuestro (data URL, CDN externo o ruta del sitio).
    return NextResponse.json({ ok: true, skipped: true });
  }

  const storage = await getFileStorage();
  if (!storage) {
    return NextResponse.json({ error: 'El almacenamiento de archivos no está disponible.' }, { status: 503 });
  }

  try {
    await storage.delete(key);
    return NextResponse.json({ ok: true, key, driver: storage.driver });
  } catch (error) {
    console.error(`[files] no se pudo borrar ${key}:`, error);
    return NextResponse.json({ error: 'No se pudo borrar el archivo.' }, { status: 502 });
  }
}
