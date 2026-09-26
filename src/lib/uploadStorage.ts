/**
 * Punto único de subida de archivos.
 *
 * Elige el motor disponible en el runtime actual:
 *   1. el binding `UPLOADS_BUCKET` de Cloudflare, que existe solo en el Worker;
 *   2. la API S3 de R2 firmada, que es lo que hay en Vercel.
 *
 * Si no hay ninguno, devuelve null y la ruta de subida responde 503 con un
 * mensaje claro en vez de fallar en silencio.
 */

import { readR2S3Config, r2S3PutObject } from './r2';

export type PutOptions = {
  contentType: string;
  name: string;
  size: number;
};

export type UploadStorage = {
  /** Identifica el motor usado, solo para diagnóstico en los logs del servidor. */
  driver: 'r2-binding' | 'r2-s3';
  put: (key: string, body: BodyInit, options: PutOptions) => Promise<void>;
};

/* Las claves del bucket son únicas y el contenido no se edita, así que un año
   de caché es seguro: es la diferencia entre pedir la misma imagen cada vez que
   se visita la página o pedirla una sola vez. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

let cached: Promise<UploadStorage | null> | null = null;

/** Se resuelve una vez por proceso: detectar el motor no debe repetirse en cada subida. */
export function getUploadStorage(): Promise<UploadStorage | null> {
  if (!cached) cached = resolveUploadStorage();
  return cached;
}

async function resolveUploadStorage(): Promise<UploadStorage | null> {
  // 1) Cloudflare Workers: el binding ya está dentro del runtime.
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as { UPLOADS_BUCKET?: R2BucketLike })?.UPLOADS_BUCKET;
    if (bucket && typeof bucket.put === 'function') {
      return {
        driver: 'r2-binding',
        put: async (key, body, options) => {
          await bucket.put(key, body as R2PutBody, {
            httpMetadata: {
              contentType: options.contentType,
              cacheControl: IMMUTABLE_CACHE,
            },
            customMetadata: { name: options.name, size: String(options.size) },
          });
        },
      };
    }
  } catch {
    // No estamos en Cloudflare: se prueba la API S3.
  }

  // 2) Vercel (o cualquier runtime sin bindings): API S3 de R2.
  const config = readR2S3Config();
  if (!config) return null;

  return {
    driver: 'r2-s3',
    put: async (key, body, options) => {
      await r2S3PutObject(config, key, body, {
        contentType: options.contentType,
        cacheControl: IMMUTABLE_CACHE,
      });
    },
  };
}

/* Tipos mínimos del binding de R2. Se declaran acá para no arrastrar los tipos
   de Cloudflare a los archivos que solo necesitan la API S3. */
type R2BucketLike = {
  put: (key: string, value: unknown, options?: unknown) => Promise<unknown>;
};
type R2PutBody = string | ArrayBuffer | ArrayBufferView | ReadableStream | null;
