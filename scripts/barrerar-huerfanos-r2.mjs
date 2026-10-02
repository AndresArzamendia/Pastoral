/**
 * Barredor de archivos huérfanos: cruza lo que hay en el bucket con lo que la
 * base de datos referencia y avisa (o borra) lo que quedó sin uso.
 *
 * Por qué existe, si el panel ya borra al reemplazar y al eliminar:
 *   - Un archivo se sube al elegirlo, pero se puede cancelar sin guardar. Quedó
 *     en el bucket y nadie lo va a usar jamás.
 *   - Los 3 archivos que se subieron a R2 al migrar las imágenes embebidas.
 *   - Borrados hechos a mano desde el panel de Cloudflare.
 *
 * Por seguridad arranca solo en simulación: hay que pasar --borrar a mano para
 * que borre de verdad. Nunca toca un archivo que la base sí referencia.
 *
 *   node scripts/barrerar-huerfanos-r2.mjs
 *   node scripts/barrerar-huerfanos-r2.mjs --borrar --dias 7
 *
 * Credenciales: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y
 * SUPABASE_SERVICE_ROLE_KEY (para leer las filas; con la anon key no alcanza).
 * Sin la service role el script avisa y no borra nada.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

/* ── Argumentos ─────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const aplicar = args.includes('--borrar');
const diasMin = Number(args[args.indexOf('--dias') + 1]) || 0;

/** Toda entrada tiene que ser más nueva que esto para poder borrarse sin permiso. */
function reciente(iso, limiteDias) {
  if (!limiteDias) return true;
  if (!iso) return false;
  return Date.now() - Date.parse(iso) < limiteDias * 86400000;
}

/* ── Entorno ─────────────────────────────────────────────────────────────── */

function cargarEnv() {
  for (const archivo of ['.env.local', '.env.production']) {
    const ruta = join(raiz, archivo);
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
      if (!m) continue;
      const valor = m[2].replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = valor;
    }
  }
}
cargarEnv();

for (const clave of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
  if (!process.env[clave]) {
    console.error(`Falta ${clave} en .env.local o .env.production.`);
    if (clave === 'R2_ACCOUNT_ID') {
      console.error('Es el ID de cuenta de Cloudflare (el mismo que se usa para desplegar).');
    } else {
      console.error(
        'Listar los archivos del bucket exige una credencial de la API de S3: en el panel de\n' +
        'Cloudflare, R2 -> Manage R2 API Tokens -> Create API Token, con permisos de\n' +
        'lectura y escritura sobre el bucket pastoral-uploads.',
      );
    }
    console.error('\nWrangler no puede listar (solo get/put/delete), así que sin estas claves no');
    console.error('hay forma de saber qué archivos sobran. El script termina sin borrar nada.');
    process.exit(1);
  }
}

/* ── R2 y Supabase ───────────────────────────────────────────────────────── */

// Se compila r2.ts porque este archivo corre en Node y el código es TypeScript.
const cache = join(process.env.TEMP || '.', 'pjl-r2-sweeper');
execFileSync('npx', ['tsc', join(raiz, 'src/lib/r2.ts'), '--outDir', cache, '--module', 'esnext',
  '--target', 'es2022', '--moduleResolution', 'bundler', '--skipLibCheck'], { stdio: 'ignore' });
const r2 = await import(pathToFileURL(join(cache, 'r2.js')).href);
const { r2S3ListObjects, r2KeyFromUrl } = r2;

const config = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_NAME || 'pastoral-uploads',
};

/* ── 1. Todo lo que hay en el bucket ─────────────────────────────────────── */

const objetos = [];
let token;
do {
  const pagina = await r2S3ListObjects(config, { maxKeys: 1000, continuationToken: token });
  objetos.push(...pagina.objects);
  token = pagina.truncated ? pagina.nextToken : undefined;
} while (token);

console.log(`Archivos en el bucket ${config.bucket}: ${objetos.length}`);

/* ── 2. Todo lo que la base referencia ───────────────────────────────────── */

const TABLAS = ['branding', 'content', 'hero', 'chapels', 'profiles', 'docs', 'news', 'stats'];
const referenciadas = new Set();
let filasTotales = 0;

for (const tabla of TABLAS) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}/rest/v1/${tabla}?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    console.error(
      `\nLa tabla "${tabla}" no se pudo leer (${res.status}). Sin SUPABASE_SERVICE_ROLE_KEY no se\n` +
      'puede saber qué archivos están en uso, y borrar a ciegas sería peor que no borrar.\n' +
      'El script termina sin borrar nada.',
    );
    process.exit(1);
  }
  if (!res.ok) continue;

  const filas = await res.json();
  if (!Array.isArray(filas)) continue;
  filasTotales += filas.length;

  for (const fila of filas) {
    for (const valor of Object.values(fila)) {
      if (typeof valor !== 'string') continue;
      if (!/^\/api\/files\/|^https?:\/\//i.test(valor)) continue;
      const clave = r2KeyFromUrl(valor);
      if (clave) referenciadas.add(clave);
    }
  }
}

console.log(`Filas revisadas: ${filasTotales}. Archivos referenciados: ${referenciadas.size}`);

/* ── 3. Los que quedaron sin uso ────────────────────────────────────────── */

const huerfanos = objetos.filter((o) => !referenciadas.has(o.key) && reciente(o.lastModified, diasMin));

if (huerfanos.length === 0) {
  console.log('\nNo hay archivos huérfanos. Nada que hacer.');
  process.exit(0);
}

const totalKB = Math.round(huerfanos.reduce((s, o) => s + o.size, 0) / 1024);
console.log(`\nHuérfanos: ${huerfanos.length} (${totalKB} KB)`);
for (const o of huerfanos.slice(0, 40)) {
  console.log(`  ${String(Math.round(o.size / 1024)).padStart(6)} KB  ${o.key}`);
}
if (huerfanos.length > 40) console.log(`  ... y ${huerfanos.length - 40} más`);

if (!aplicar) {
  console.log('\nSIMULACIÓN: no se borró nada. Para borrar de verdad: --borrar');
  process.exit(0);
}

if (diasMin === 0) {
  console.log('\nAviso: sin --dias se considerarían también los archivos más antiguos.');
  console.log('Para ir con cuidado: --borrar --dias 30.');
}

/* ── 4. Borrado ──────────────────────────────────────────────────────────── */

const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
let borrados = 0;

/* El borrado va por la API de S3 y, si eso fallara, cae a Wrangler, que ya tiene
   sesión iniciada por OAuth. Así una credencial vencida no deja archivos colgados
   y, sobre todo, no hay que hacer un segundo camino de código si mañana se rota
   el acceso por API. */
function borrarConWrangler(clave) {
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'delete', `pastoral-uploads/${clave}`],
    { cwd: raiz, stdio: 'ignore' },
  );
}

for (const o of huerfanos) {
  try {
    await r2.r2S3DeleteObject(config, o.key);
    borrados++;
    console.log(`  borrado  ${o.key}`);
  } catch (error) {
    try {
      borrarConWrangler(o.key);
      borrados++;
      console.log(`  borrado  ${o.key}  (vía Wrangler: ${error.message.slice(0, 60)})`);
    } catch (fallbackError) {
      console.error(`  FALLÓ    ${o.key}: ${fallbackError.message}`);
    }
  }
}

console.log(`\nBorrados ${borrados} de ${huerfanos.length}.`);
if (base) console.log(`\nLos que quedaban vivos se siguen sirviendo desde ${base}/<clave>.`);