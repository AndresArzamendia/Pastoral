/**
 * Almacén de archivos del bucket.
 *
 * El proyecto se despliega en dos sitios y cada uno tiene una forma distinta de
 * llegar al mismo bucket de Cloudflare R2:
 *
 *   - En el Worker de Cloudflare existe el binding `UPLOADS_BUCKET` y se usa
 *     directamente (rápido, sin firmar nada).
 *   - En Vercel no hay binding, así que se habla con la API S3 de R2 firmando la
 *     petición con SigV4.
 *
 * Para LEER hay una tercera vía, la mejor de todas: si el bucket se entrega con
 * su URL pública, la respuesta es un redirect y el archivo baja del edge de
 * Cloudflare sin pasar por el servidor. Cuando esa URL no está configurada se
 * cae al binding o a la API S3, que sí consumen invocaciones, pero al menos la
 * imagen aparece. Antes no había ninguna de las dos y por eso en Vercel las
 * imágenes no se veían.
 */

import { readR2S3Config, r2S3PutObject, r2S3GetObject, r2S3DeleteObject } from './r2';

export type PutOptions = {
  contentType: string;
  name: string;
  size: number;
};

export type StoredFile = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  /** Nombre original, si el bucket lo guarda. */
  name?: string;
};

export type FileStorage = {
  /** Identifica el motor usado, solo para diagnóstico en los logs del servidor. */
  driver: 'r2-binding' | 'r2-s3';
  put: (key: string, body: BodyInit, options: PutOptions) => Promise<void>;
  get: (key: string) => Promise<StoredFile | null>;
  delete: (key: string) => Promise<boolean>;
};

/* Las claves del bucket son únicas y el contenido no se edita, así que un año
   de caché es seguro: es la diferencia entre pedir la misma imagen cada vez que
   se visita la página o pedirla una sola vez. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

let cached: Promise<FileStorage | null> | null = null;

/** Se resuelve una vez por proceso: detectar el motor no debe repetirse en cada petición. */
export function getFileStorage(): Promise<FileStorage | null> {
  if (!cached) cached = resolveFileStorage();
  return cached;
}

async function resolveFileStorage(): Promise<FileStorage | null> {
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
        get: async (key) => {
          const obj = await bucket.get(key);
          if (!obj) return null;
          return {
            stream: obj.body as ReadableStream<Uint8Array>,
            contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
            name: obj.customMetadata?.name,
          };
        },
        delete: async (key) => {
          await bucket.delete(key);
          return true;
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
    put: (key, body, options) =>
      r2S3PutObject(config, key, body, { contentType: options.contentType, cacheControl: IMMUTABLE_CACHE }),
    get: (key) => r2S3GetObject(config, key),
    delete: (key) => r2S3DeleteObject(config, key),
  };
}

/* Tipos mínimos del binding de R2. Se declaran acá para no arrastrar los tipos
   de Cloudflare a los archivos que solo necesitan la API S3. */
type R2BucketLike = {
  put: (key: string, value: unknown, options?: unknown) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectLike | null>;
  delete: (key: string) => Promise<unknown>;
};
type R2PutBody = string | ArrayBuffer | ArrayBufferView | ReadableStream | null;
type R2ObjectLike = {
  body: ReadableStream<Uint8Array> | null;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};
