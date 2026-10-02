/**
 * Limpieza de archivos al borrar contenido del panel.
 *
 * Los archivos viven en el bucket de R2, pero lo que se borra desde el panel es
 * una fila de la base. Sin este paso el archivo queda huérfano en R2 ocupando
 * espacio y se sigue pagando por él para siempre, y la base y el bucket quedan
 * desincronizados: la base dice que ya no existe algo que sigue downloadable.
 *
 * Se manda la dirección que estaba guardada y el servidor saca la clave, porque
 * el navegador no tiene las variables de R2.
 */

import { adminFetch } from './adminAuth';

/** Campos que pueden apuntar a un archivo del bucket, según el tipo de contenido. */
export type StoredFileRef = {
  url?: string | null;
  photo?: string | null;
  cvUrl?: string | null;
  logoUrl?: string | null;
  previewImage?: string | null;
  imageUrl?: string | null;
};

/**
 * Borra del bucket todos los archivos que referencie un elemento.
 *
 * Nunca tira: si el bucket no está disponible o la petición falla, el elemento
 * igual se borra de la base y el archivo huérfano se limpia en otro momento. Es
 * peor que sobre un archivo que bloquear el borrado de la fila.
 */
export async function deleteStoredFiles(item: StoredFileRef | null | undefined): Promise<number> {
  if (!item) return 0;

  const candidatos = [
    item.url,
    item.photo,
    item.cvUrl,
    item.logoUrl,
    item.previewImage,
    item.imageUrl,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  // La misma imagen puede estar en dos campos (por ejemplo photo y logoUrl).
  const unicas = Array.from(new Set(candidatos));
  if (unicas.length === 0) return 0;

  let borrados = 0;
  for (const url of unicas) {
    // Las imágenes embebidas en la base se van con la fila: no hay nada que borrar.
    if (url.startsWith('data:')) continue;
    try {
      const res = await adminFetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) borrados++;
      else console.warn(`[ficheros] no se pudo borrar ${url}: ${res.status}`);
    } catch (error) {
      console.warn(`[ficheros] falló el borrado de ${url}:`, error);
    }
  }
  return borrados;
}

/**
 * Borra el archivo que queda sin usar al cambiarlo por otro.
 *
 * Es la fuente más común de archivos huérfanos: cambiar el logo, la foto de un
 * miembro, el carrusel o el PDF del estatuto deja el archivo anterior en el
 * bucket para siempre, porque en la base queda solo la dirección nueva y del
 * archivo viejo no queda ni rastro. Sin esto el bucket se llena de archivos que
 * nadie vuelve a usar y se sigue pagando por ellos.
 */
export async function replaceStoredFile(previousUrl: unknown, nextUrl: unknown): Promise<void> {
  const antes = typeof previousUrl === 'string' ? previousUrl : '';
  const despues = typeof nextUrl === 'string' ? nextUrl : '';

  if (!antes) return;
  if (antes === despues) return;
  // Las imágenes embebidas en la base desaparecen con la fila, no en el bucket.
  if (antes.startsWith('data:')) return;

  await deleteStoredFiles({ url: antes });
}

/* ── Limpieza al guardar ─────────────────────────────────────────────────────
 *
 * Todas las escrituras del panel pasan por useLS(key). Comparando el valor
 * anterior con el nuevo se detecta, de una sola vez y en un único lugar, todo
 * archivo que quedó sin referencia: el logo que se reemplazó, la foto que se
 * cambió, el currículum que se quitó, el documento o la diapositiva que se
 * borró. Es más confiable que acordarse de limpiar en cada botón.
 */

/** URLs que podrían apuntar a un archivo del bucket. */
function pareceArchivo(valor: string): boolean {
  if (!valor || valor.startsWith('data:')) return false;
  return valor.startsWith('/api/files/') || /^https?:\/\//i.test(valor);
}

/** Junta todas las direcciones de archivo de cualquier estructura JSON. */
export function collectFileUrls(valor: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof valor === 'string') {
    if (pareceArchivo(valor)) out.add(valor);
    return out;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) collectFileUrls(item, out);
    return out;
  }
  if (valor && typeof valor === 'object') {
    for (const key of Object.keys(valor as object)) collectFileUrls((valor as Record<string, unknown>)[key], out);
  }
  return out;
}

/**
 * Borra del bucket los archivos que estaban en el valor anterior y ya no están
 * en el nuevo.
 *
 * Va en una sola petición: es lo que se ejecuta en cada guardado del panel, así
 * que mandar una request por archivo multiplicaría el trabajo sin necesidad.
 * Nunca tira: un fallo acá no puede impedir que se guarde el contenido.
 */
export async function cleanupRemovedFiles(previous: unknown, next: unknown): Promise<number> {
  try {
    const antes = collectFileUrls(previous);
    const despues = collectFileUrls(next);

    const huerfanos = [...antes].filter((url) => !despues.has(url));
    if (huerfanos.length === 0) return 0;
    return await deleteStoredUrlList(huerfanos);
  } catch (error) {
    console.warn('[ficheros] falló la limpieza de archivos huérfanos:', error);
    return 0;
  }
}

/**
 * Borra del bucket una lista concreta de archivos, en una sola petición.
 *
 * Es lo que usa cleanupRemovedFiles al comparar dos valores, y también el panel
 * cuando el usuario sube un archivo en un modal y después cancela: en ese caso hay
 * que borrar exactamente lo que se subió, porque nunca llegó a guardarse.
 *
 * Nunca tira. Que quede un archivo de más es un problema de espacio; que el
 * contenido no se pueda guardar, no.
 */
export async function deleteStoredUrlList(urls: string[]): Promise<number> {
  if (!urls.length) return 0;
  try {
    const res = await adminFetch('/api/files/limpiar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    if (!res.ok) {
      console.warn(`[ficheros] no se pudo limpiar ${urls.length} archivo(s): ${res.status}`);
      return 0;
    }
    const json = (await res.json().catch(() => null)) as { borrados?: number } | null;
    return json?.borrados ?? 0;
  } catch (error) {
    console.warn('[ficheros] falló el borrado de archivos:', error);
    return 0;
  }
}
