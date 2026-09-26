/**
 * Subida de archivos.
 *
 * Destino preferido: el almacenamiento de archivos de Cloudflare (R2), donde un
 * archivo no se copia dentro de la base de datos y se sirve desde el borde.
 *
 * Si R2 no está disponible solo se permite el último recurso: guardar imágenes
 * MUY PEQUEÑAS dentro de la base de datos. Los archivos grandes (currículums,
 * PDF, planillas) guardados ahí se vuelven a descargar enteros en cada visita
 * y disparan la factura, así que se rechazan con un mensaje claro.
 */

const DB_FALLBACK_MAX_BYTES = 150 * 1024;

export type UploadResult =
  | { ok: true; url: string; inDatabase: boolean }
  | { ok: false; error: string };

async function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

import { adminFetch } from './adminAuth';

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

/**
 * Sube un archivo y devuelve su dirección.
 * `inDatabase: true` avisa de que quedó guardado dentro de la base de datos
 * (último recurso, solo para imágenes pequeñas).
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  const url = await uploadFileToR2(file);
  if (url) return { ok: true, url, inDatabase: false };

  if (file.size > DB_FALLBACK_MAX_BYTES) {
    return {
      ok: false,
      error:
        'El almacenamiento de archivos no está activo, y este archivo es demasiado pesado ' +
        `(${(file.size / (1024 * 1024)).toFixed(1)} MB) para guardarlo en la base de datos.\n\n` +
        'Activa el almacenamiento de archivos (R2) en el panel de Cloudflare y volvé a intentarlo.',
    };
  }

  const dataUrl = await readAsDataUrl(file);
  if (!dataUrl) return { ok: false, error: 'No se pudo leer el archivo seleccionado.' };

  console.warn(
    `[upload] "${file.name}" (${Math.round(file.size / 1024)} KB) quedó guardado dentro de la base de datos ` +
    'porque el almacenamiento de archivos no está disponible.',
  );
  return { ok: true, url: dataUrl, inDatabase: true };
}
