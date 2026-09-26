/**
 * Subida de archivos.
 *
 * Los archivos van siempre al bucket de Cloudflare R2, nunca a la base de datos.
 *
 * Antes, si R2 no estaba disponible se guardaba la imagen embebida en base64
 * dentro del JSON de pjl_store como último recurso. Eso fue un error caro: la
 * tabla llegó a 4 MB y el 98% eran imágenes en base64. Cada visitante nuevo
 * descargaba esos 4 MB por Supabase, las filas se leían enteras para cambiar un
 * solo dato, y esas imágenes no se podían cachear en el CDN ni borrar del
 * bucket. Si R2 no está disponible ahora se avisa con un mensaje claro y se
 * rechaza la subida.
 */

import { adminFetch } from './adminAuth';

export type UploadResult =
  | { ok: true; url: string; inDatabase: false }
  | { ok: false; error: string };

/** Solo devuelve la URL cuando el archivo quedó en el bucket. */
export async function uploadFileToR2(file: File): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    // adminFetch: la ruta de subida exige sesión del panel.
    const res = await adminFetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string } | null;
    return json?.ok && json.url ? json.url : null;
  } catch {
    return null;
  }
}

const SIN_ALMACENAMIENTO =
  'No se pudo guardar el archivo porque el almacenamiento de Cloudflare no está ' +
  'disponible en este despliegue.\n\n' +
  'Las imágenes ya no se guardan dentro de la base de datos a propósito: llenaban ' +
  'la base de 4 MB y hacía descargar ese peso a cada visitante.\n\n' +
  'Revisá que el bucket R2 esté habilitado y que el despliegue tenga las credenciales ' +
  '(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY), y volvé a intentarlo.';

/**
 * Sube un archivo y devuelve su dirección.
 *
 * El campo `inDatabase` ya no existe: todo va al bucket. Se mantiene en el tipo
 * de retorno para no romper los llamadores que lo leen.
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  const url = await uploadFileToR2(file);
  if (url) return { ok: true, url, inDatabase: false };
  return { ok: false, error: SIN_ALMACENAMIENTO };
}
