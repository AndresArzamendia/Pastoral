/**
 * Almacenamiento de archivos subidos (logos, fotos, PDF).
 *
 * El proyecto se despliega en DOS sitios y cada uno tiene una forma distinta de
 * llegar al mismo bucket de Cloudflare R2:
 *
 *   - En el Worker de Cloudflare existe el binding `UPLOADS_BUCKET` y se usa
 *     directamente (rápido, sin firmar nada).
 *   - En Vercel no hay binding, así que se habla con la API S3 de R2 firmando la
 *     petición con SigV4.
 *
 * Para LEER: si se configura una URL pública del bucket (R2_PUBLIC_BASE_URL)
 * los archivos se piden directo a Cloudflare, sin gastar invocaciones del
 * servidor. Si no está configurada, se guarda `/api/files/<clave>` y cada sitio
 * la resuelve con lo suyo (binding en Workers, API S3 en Vercel); la imagen
 * igual se ve, solo que pasa por el servidor.
 *
 * La URL pública NUNCA se infiere del account id: la pública automática de R2
 * responde 401 a menos que el acceso público del bucket esté realmente
 * habilitado, y verificar eso en cada deploy no es fiable.
 */

const DEFAULT_BUCKET = 'pastoral-uploads';
const REGION = 'auto';
const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

/** R2 acepta este valor en vez del hash: permite subir sin leer el archivo entero en memoria. */
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

const encoder = new TextEncoder();

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

export function r2BucketName(): string {
  return readEnv('R2_BUCKET_NAME') || DEFAULT_BUCKET;
}

export function r2AccountId(): string {
  return readEnv('R2_ACCOUNT_ID');
}

/** ¿Están las credenciales necesarias para escribir con la API S3? */
export function hasR2S3Credentials(): boolean {
  return Boolean(r2AccountId() && readEnv('R2_ACCESS_KEY_ID') && readEnv('R2_SECRET_ACCESS_KEY'));
}

/**
 * Origen público del bucket, sin barra final.
 *
 * Solo se usa si está configurado explícitamente con R2_PUBLIC_BASE_URL (por
 * ejemplo un dominio propio como media.eldominio.org). Si no está seteado,
 * devuelve '' y la subida guarda `/api/files/<clave>`, que cada deploy resuelve
 * con su propio mecanismo (binding o API S3).
 */
export function r2PublicBaseUrl(): string {
  return readEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
}

/**
 * URL pública de un archivo del bucket, o '' si R2 no está configurado.
 * Es la dirección que se guarda en la base de datos: no depende de que el sitio
 * esté desplegado en Vercel o en Cloudflare.
 */
export function r2PublicUrl(key: string): string {
  const base = r2PublicBaseUrl();
  if (!base || !key) return '';
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Convierte una dirección guardada (/api/files/clave o URL absoluta) en su clave dentro del bucket. */
export function r2KeyFromUrl(url: string): string {
  if (!url) return '';
  const marker = '/api/files/';
  const at = url.indexOf(marker);
  if (at >= 0) return url.slice(at + marker.length).split('?')[0].split('#')[0];
  if (url.startsWith('/')) return '';
  try {
    const base = r2PublicBaseUrl();
    if (base && url.startsWith(base + '/')) return url.slice(base.length + 1);
  } catch { /* sin base configurada */ }
  return '';
}

// ── Firma SigV4 (AWS Signature Version 4) ─────────────────────────────────────
// R2 no acepta requests anónimos, así que hay que firmar. Solo se firma la
// subida: la lectura va por la URL pública y no necesita credenciales.

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(data) as BufferSource));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data) as BufferSource);
}

/** AWS Codifica según RFC 3986: encodeURIComponent deja fuera !'()* y S3 los escapa. */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Rutas de S3: cada segmento se codifica por separado y NO se normaliza la ruta. */
function canonicalUri(path: string): string {
  return path.split('/').map(rfc3986).join('/');
}

/**
 * Query string canónica: parámetros ordenados por nombre y codificados.
 * Se necesita para ListObjectsV2 (el barredor de archivos huérfanos), que
 * R2 atiende por la API S3 igual que cualquier otra operación.
 */
export function canonicalQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [rfc3986(k), rfc3986(String(v))] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function amzDates(now: Date): { stamp: string; iso: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { stamp: iso.slice(0, 8), iso };
}

export type R2S3Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function readR2S3Config(): R2S3Config | null {
  const accountId = r2AccountId();
  const accessKeyId = readEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = readEnv('R2_SECRET_ACCESS_KEY');
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket: r2BucketName() };
}

/**
 * Arma los headers de una petición firmada con SigV4.
 *
 * Se separa del PUT y del GET para que ambos firmen exactamente igual, y para
 * que el algoritmo se pueda verificar contra los vectores de prueba de AWS
 * (scripts/verificar-firma-r2.mjs).
 */
export async function sigV4Headers(params: {
  method: string;
  host: string;
  path: string;
  region?: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
  /** Hash del cuerpo, o UNSIGNED_PAYLOAD para poder mandarlo en streaming. */
  payloadHash?: string;
  /** Query string, ya en su forma canónica (ver canonicalQuery). */
  query?: string;
  /**
   * Headers adicionales que entran en la firma. R2 exige x-amz-content-sha256;
   * con la suite de AWS se pueden comprobar los casos que no la incluyen.
   */
  signedExtraHeaders?: Record<string, string>;
}): Promise<Record<string, string>> {
  const region = params.region || REGION;
  const service = params.service || SERVICE;
  const payloadHash = params.payloadHash || UNSIGNED_PAYLOAD;
  const { stamp, iso } = amzDates(params.date);

  // CanonicalHeaders: nombres en minúscula, ordenados, valores sin espacios
  // redundantes. El orden alfabético es obligatorio.
  const toSign: Record<string, string> = { host: params.host, 'x-amz-date': iso };
  for (const [name, value] of Object.entries(params.signedExtraHeaders || {})) {
    toSign[name.toLowerCase()] = value;
  }
  const names = Object.keys(toSign).sort();
  const canonicalHeaders = names.map((n) => `${n}:${toSign[n].trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    params.method,
    canonicalUri(params.path),
    params.query || '', // query string canónica, ya vacía si no hay
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${stamp}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, iso, scope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate = await hmac(encoder.encode(`AWS4${params.secretAccessKey}`), stamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  const headers: Record<string, string> = {
    Authorization:
      `${ALGORITHM} Credential=${params.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-date': iso,
  };
  for (const [name, value] of Object.entries(params.signedExtraHeaders || {})) {
    headers[name] = value;
  }
  return headers;
}

/**
 * Sube un objeto con la API S3 de R2.
 *
 * Se firma con UNSIGNED-PAYLOAD para no tener que leer el archivo entero en
 * memoria calculando su hash: el body va directo como File, que el runtime
 * transmite por streaming.
 */
export async function r2S3PutObject(
  config: R2S3Config,
  key: string,
  body: BodyInit,
  options: { contentType: string; cacheControl?: string },
): Promise<void> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${config.bucket}/${key}`;

  const signed = await sigV4Headers({
    method: 'PUT',
    host,
    path,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    date: new Date(),
    signedExtraHeaders: { 'x-amz-content-sha256': UNSIGNED_PAYLOAD },
  });

  const res = await fetch(`https://${host}${canonicalUri(path)}`, {
    method: 'PUT',
    headers: {
      ...signed,
      'Content-Type': options.contentType,
      ...(options.cacheControl ? { 'Cache-Control': options.cacheControl } : {}),
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`R2 respondió ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
}

export type R2S3Object = { key: string; size: number; lastModified?: string };

export type R2ListResult = { objects: R2S3Object[]; truncated: boolean; nextToken?: string };

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Lista los objetos del bucket (ListObjectsV2).
 *
 * Lo usa el barredor de archivos huérfanos: cruzando lo que hay en el bucket con
 * lo que la base referencia, se puede borrar lo que quedó sin usar. Limpiar en el
 * momento del borrado es lo correcto, pero esto cubre lo que se haya quedado
 * huérfano antes, o por un borrado hecho a mano desde el panel de Cloudflare.
 */
export async function r2S3ListObjects(
  config: R2S3Config,
  options: { maxKeys?: number; continuationToken?: string } = {},
): Promise<R2ListResult> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${config.bucket}`;

  const query = canonicalQuery({
    'list-type': '2',
    'max-keys': options.maxKeys ?? 1000,
    ...(options.continuationToken ? { 'continuation-token': options.continuationToken } : {}),
  });

  const signed = await sigV4Headers({
    method: 'GET',
    host,
    path,
    query,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    date: new Date(),
    signedExtraHeaders: { 'x-amz-content-sha256': UNSIGNED_PAYLOAD },
  });

  const res = await fetch(`https://${host}${canonicalUri(path)}?${query}`, { headers: signed });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`R2 respondió ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const xml = await res.text();
  const objects: R2S3Object[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const bloque = match[1];
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(bloque)?.[1];
    if (!key) continue;
    objects.push({
      key: decodeXmlEntities(key),
      size: Number(/<Size>(\d+)<\/Size>/.exec(bloque)?.[1] ?? 0),
      lastModified: /<LastModified>([\s\S]*?)<\/LastModified>/.exec(bloque)?.[1],
    });
  }

  return {
    objects,
    truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
    nextToken: /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1],
  };
}

/**
 * Borra un objeto del bucket.
 *
 * Sirve para que cuando se elimina un documento o una foto del panel no
 * quede el archivo huérfano en R2 cobrando almacenamiento para siempre.
 *
 * El borrado es idempotente: R2 responde 204 tanto si el objeto estaba como si
 * ya no estaba, así que el valor de retorno confirma que la petición se atendió,
 * no que había algo que borrar.
 */
export async function r2S3DeleteObject(config: R2S3Config, key: string): Promise<boolean> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${config.bucket}/${key}`;

  const signed = await sigV4Headers({
    method: 'DELETE',
    host,
    path,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    date: new Date(),
    signedExtraHeaders: { 'x-amz-content-sha256': UNSIGNED_PAYLOAD },
  });

  const res = await fetch(`https://${host}${canonicalUri(path)}`, { method: 'DELETE', headers: signed });

  if (res.status === 404) return false;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`R2 respondió ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  // R2 contesta 204 cuando el objeto no existía, así que un 2xx no alcanza
  // para saber si había algo que borrar.
  return true;
}

/** Descarga un objeto con la API S3. Solo se usa si el bucket no es público. */
export async function r2S3GetObject(
  config: R2S3Config,
  key: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${config.bucket}/${key}`;

  const signed = await sigV4Headers({
    method: 'GET',
    host,
    path,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    date: new Date(),
    signedExtraHeaders: { 'x-amz-content-sha256': UNSIGNED_PAYLOAD },
  });

  const res = await fetch(`https://${host}${canonicalUri(path)}`, { headers: signed });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 respondió ${res.status}`);
  if (!res.body) return null;

  return {
    stream: res.body as ReadableStream<Uint8Array>,
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}
