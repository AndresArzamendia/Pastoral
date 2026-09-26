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
