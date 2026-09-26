/**
 * Saca de la base de datos las imágenes que están embebidas como base64 y las
 * sube al bucket de Cloudflare R2.
 *
 * Por qué:
 *   - La tabla pjl_store llegó a pesar 4 MB, y el 98% eran imágenes en base64.
 *     Cada visitante nuevo descargaba esos 4 MB por Supabase en la primera
 *     visita, y no se cacheaban como objetos separados.
 *   - Una fila enorme se lee entera para cambiar un solo dato: la fila `chapels`
 *     pesaba 3,2 MB.
 *   - Al estar dentro del JSON no se pueden borrar del bucket, cachear en el CDN
 *     ni volver a pedirlas nunca.
 *
 * No hace falta ninguna API key: sube con `wrangler r2 object put`, que usa la
 * sesión de Cloudflare con la que ya estás conectado.
 *
 *   node scripts/migrar-imagenes-a-r2.mjs            # simula, no escribe nada
 *   node scripts/migrar-imagenes-a-r2.mjs --aplicar   # migra de verdad
 *
 * Opciones:
 *   --bucket=<nombre>     Bucket destino (por defecto el de R2_BUCKET_NAME).
 *   --url=api|publica     Dejar "/api/files/<clave>" o la URL pública del bucket.
 *                         Por defecto: pública si se puede armar, si no /api/files.
 *   --clave-prefijo=<x>   Prefijo de las claves nuevas (por defecto "migrado").
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

const argumentos = process.argv.slice(2);
const aplicar = argumentos.includes('--aplicar');
const valorDe = (nombre, porDefecto) => {
  const found = argumentos.find((a) => a.startsWith(`--${nombre}=`));
  return found ? found.slice(nombre.length + 3) : porDefecto;
};

// ── Configuración ─────────────────────────────────────────────────────────────

function leerEnvLocal() {
  const archivo = join(raiz, '.env.local');
  if (!existsSync(archivo)) return {};
  const valores = {};
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(linea);
    if (m) valores[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return valores;
}

function leerEnvProduccion() {
  const archivo = join(raiz, '.env.production');
  if (!existsSync(archivo)) return {};
  const valores = {};
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(linea);
    if (m) valores[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return valores;
}

const env = { ...leerEnvProduccion(), ...leerEnvLocal(), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const BUCKET = valorDe('bucket', env.R2_BUCKET_NAME || 'pastoral-uploads');
const PREFIJO = valorDe('clave-prefijo', 'migrado');
const MODO_URL = valorDe('url', 'auto');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL / la clave en .env.production o .env.local');
  process.exit(1);
}

/* La clave pública solo puede leer. Para escribir hace falta la de servicio, que
   salta las reglas de RLS. Se avisa antes de subir 1,5 MB para nada. */
if (aplicar && !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Para escribir en la base hace falta SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  Supabase · Project Settings · API · service_role · anon\n' +
      '  Ponela en .env.local (que está en .gitignore) y volvé a correrlo.\n' +
      '  Sin esa clave el script no puede Guardar los cambios.',
  );
  process.exit(1);
}

/** Base pública del bucket, o '' si no se puede armar. */
function basePublica() {
  const explicita = (env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (explicita) return explicita;
  if (env.R2_ACCOUNT_ID) return `https://pub-${env.R2_ACCOUNT_ID}.r2.dev/${BUCKET}`;
  return '';
}

const URL_PUBLICA = basePublica();
const usarPublica = MODO_URL === 'publica' || (MODO_URL === 'auto' && Boolean(URL_PUBLICA));
if (usarPublica && !URL_PUBLICA) {
  console.error('Se pidió URL pública pero no hay R2_PUBLIC_BASE_URL ni R2_ACCOUNT_ID.');
  process.exit(1);
}

/** Dirección que queda guardada en la base en lugar del base64. */
function urlPara(clave) {
  return usarPublica ? `${URL_PUBLICA}/${clave}` : `/api/files/${clave}`;
}

// ── Descarga de la tabla ──────────────────────────────────────────────────────

const cabeceras = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function leerStore() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pjl_store?select=key,value`, { headers: cabeceras });
  if (!res.ok) throw new Error(`No se pudo leer pjl_store: ${res.status} ${await res.text()}`);
  return res.json();
}

async function guardarStore(key, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pjl_store?key=eq.${encodeURIComponent(key)}`, {
    method: 'PATCH',
    // return=representation es obligatorio: sin esto PostgREST contesta 204 tanto
    // si actualizó la fila como si no encontró ninguna, y el script termina
    // "migrando" sin haber escrito nada.
    headers: { ...cabeceras, Prefer: 'return=representation' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`No se pudo guardar "${key}": ${res.status} ${await res.text()}`);

  const filas = await res.json().catch(() => null);
  if (!Array.isArray(filas) || filas.length === 0) {
    throw new Error(
      `La base no devolvió la fila "${key}" después de actualizarla. ` +
        'Suele pasar cuando la clave que se está usando no tiene permiso de escritura: ' +
        'hace falta SUPABASE_SERVICE_ROLE_KEY (Supabase · Project Settings · API).',
    );
  }
}

// ── Subida a R2 con wrangler ──────────────────────────────────────────────────

const temporal = mkdtempSync(join(tmpdir(), 'pjl-migra-'));
const subidas = new Set();

function subirA(key, buffer, contentType) {
  if (subidas.has(key)) return;
  const archivo = join(temporal, 'objeto');
  writeFileSync(archivo, buffer);
  execFileSync(
    process.execPath,
    [
      join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
      'r2', 'object', 'put', `${BUCKET}/${key}`,
      `--file=${archivo}`,
      `--content-type=${contentType}`,
      '--remote',
    ],
    { cwd: raiz, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  subidas.add(key);
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

// ── Migración ─────────────────────────────────────────────────────────────────

/* Se buscan las imágenes dentro del JSON serializado, no en el objeto: así da
   igual si están anidadas en un arreglo, en un campo de texto o deeply inside. */
const DATA_URL = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g;

const filas = await leerStore();
const plan = [];

for (const fila of filas) {
  if (fila.value === null || fila.value === undefined) continue;
  const texto = JSON.stringify(fila.value);
  const encontrados = [...texto.matchAll(DATA_URL)];
  if (encontrados.length === 0) continue;
  plan.push({ key: fila.key, texto, encontrados });
}

if (plan.length === 0) {
  console.log('No hay imágenes embebidas en la base. Nada que hacer.');
  process.exit(0);
}

console.log(`\n${aplicar ? 'MIGRANDO' : 'SIMULANDO'} · destino ${usarPublica ? 'URL pública' : '/api/files'}\n`);

let totalAntes = 0;
let totalDespues = 0;
let totalImagenes = 0;
const porClave = new Map();

for (const item of plan) {
  let reemplazado = item.texto;
  for (const encontrado of item.encontrados) {
    const contentType = encontrado[1];
    const base64 = encontrado[2].replace(/\s+/g, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) continue;

    // Misma imagen repetida en varios lugares -> un solo archivo, misma clave.
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const extension = contentType.split('/')[1].replace('+xml', '').replace('jpeg', 'jpg') || 'png';
    const clave = `${PREFIJO}-${hash}.${extension}`;

    totalImagenes++;
    porClave.set(clave, { buffer, contentType, bytes: buffer.length });

    if (aplicar) subirA(clave, buffer, contentType);
    // Se reemplaza en todas las apariciones: split/join en vez de replace, para
    // no tener que escapar los caracteres especiales del base64.
    reemplazado = reemplazado.split(encontrado[0]).join(urlPara(clave));
  }

  item.nuevoTexto = reemplazado;
  item.cambia = item.nuevoTexto !== item.texto;
}

for (const item of plan) {
  const antes = Buffer.byteLength(item.texto);
  const despues = Buffer.byteLength(item.nuevoTexto);
  totalAntes += antes;
  totalDespues += despues;
  console.log(
    `  ${item.key.padEnd(20)} ${kb(antes).padStart(9)}  ->  ${kb(despues).padStart(9)}` +
    `  (${item.encontrados.length} imagen${item.encontrados.length === 1 ? '' : 'es'})`,
  );
}

console.log(`\n  ${'imágenes'.padEnd(20)} ${String(totalImagenes).padStart(9)}  archivos nuevos en ${BUCKET}`);

const totalBytes = [...porClave.values()].reduce((n, v) => n + v.bytes, 0);
console.log(`  ${'peso en el bucket'.padEnd(20)} ${kb(totalBytes).padStart(9)}  (base64 pesa ~33% más que el archivo)`);

if (!aplicar) {
  console.log(`\n  Base de datos: ${kb(totalAntes)}  ->  ${kb(totalDespues)}  (ahorro ${kb(totalAntes - totalDespues)})`);
  console.log('\n  Esto fue una simulación. Volvé a correrlo con --aplicar para hacerlo de verdad.\n');
  rmSync(temporal, { recursive: true, force: true });
  process.exit(0);
}

console.log('');
for (const item of plan) {
  if (!item.cambia) continue;
  await guardarStore(item.key, JSON.parse(item.nuevoTexto));
  console.log(`  guardada la clave "${item.key}"`);
}

rmSync(temporal, { recursive: true, force: true });

console.log(`\n  Base de datos: ${kb(totalAntes)}  ->  ${kb(totalDespues)}  (ahorro ${kb(totalAntes - totalDespues)})`);
console.log(`\n  Listo. Las imágenes quedaron en ${BUCKET} y la base solo guarda su dirección.\n`);
