/**
 * Verifica la firma SigV4 de src/lib/r2.ts contra la suite oficial de AWS
 * (awslabs/aws-c-auth, tests/aws-signing-test-suite/v4).
 *
 * Por qué importa: si el algoritmo se desvía aunque sea un carácter, R2 responde
 * 403 y el único síntoma sería que las imágenes no aparecen en el sitio.
 *
 *   node scripts/verificar-firma-r2.mjs
 *
 * No usa credenciales reales: la suite trabaja con credenciales de ejemplo.
 * La suite se descarga sola si no está presente. Para usar una copia local:
 *   set SIGV4_SUITE=<carpeta>
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const SUITE_REMOTA = 'https://api.github.com/repos/awslabs/aws-c-auth/contents/tests/aws-signing-test-suite/v4';
const SUITE_CRUDA = 'https://raw.githubusercontent.com/awslabs/aws-c-auth/main/tests/aws-signing-test-suite/v4';
const ARCHIVOS = ['context.json', 'request.txt', 'header-canonical-request.txt', 'header-signed-request.txt'];

const suite = process.env.SIGV4_SUITE || join(tmpdir(), 'pjl-sigv4-suite');

async function descargarSuite(destino) {
  mkdirSync(destino, { recursive: true });
  const cabeceras = { 'User-Agent': 'pjl-verificar-firma-r2' };
  const listado = await (await fetch(SUITE_REMOTA, { headers: cabeceras })).json();
  for (const caso of listado) {
    if (caso.type !== 'dir') continue;
    mkdirSync(join(destino, caso.name), { recursive: true });
    for (const archivo of ARCHIVOS) {
      const res = await fetch(`${SUITE_CRUDA}/${caso.name}/${archivo}`, { headers: cabeceras });
      if (res.ok) writeFileSync(join(destino, caso.name, archivo), Buffer.from(await res.arrayBuffer()));
    }
  }
}

if (!existsSync(join(suite, 'get-vanilla', 'header-signed-request.txt'))) {
  console.log('Descargando la suite de pruebas de AWS...');
  try {
    await descargarSuite(suite);
  } catch (error) {
    console.error('No se pudo descargar la suite:', error.message);
    console.error('Descargala a mano y apuntá SIGV4_SUITE a la carpeta.');
    process.exit(1);
  }
}

/* ── Compilar r2.ts a un temporal para poder importarlo ────────────────────────*/

const temporal = mkdtempSync(join(tmpdir(), 'pjl-r2-'));
const salida = join(temporal, 'r2.mjs');

let r2;
try {
  execFileSync(
    process.execPath,
    [
      join(raiz, 'node_modules', 'typescript', 'bin', 'tsc'),
      join(raiz, 'src', 'lib', 'r2.ts'),
      '--outDir', temporal,
      '--module', 'esnext',
      '--target', 'es2022',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
    ],
    { stdio: 'pipe' },
  );
  writeFileSync(salida, readFileSync(join(temporal, 'r2.js')));
  r2 = await import(pathToFileURL(salida).href);
} catch (error) {
  console.error('No se pudo compilar r2.ts:', error.stdout?.toString() || error.message);
  rmSync(temporal, { recursive: true, force: true });
  process.exit(1);
}

const { sigV4Headers, r2PublicUrl, r2PublicBaseUrl, r2KeyFromUrl } = r2;

let fallos = 0;
let omitidos = 0;
function comprobar(nombre, ok, detalle) {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}`);
  if (!ok) {
    if (detalle) console.log(`      ${String(detalle).split('\n').join('\n      ')}`);
    fallos++;
  }
}

/* ── 1) Suite oficial de AWS ───────────────────────────────────────────────────*/

/* El canonical request esperado declara qué headers se firman y cuál es el hash
   del cuerpo: el test reproduce esa entrada y compara la firma completa. */
function leerCanonico(texto) {
  const lineas = texto.split('\n');
  if (lineas[lineas.length - 1] === '') lineas.pop();
  const payloadHash = lineas[lineas.length - 1];
  const cuerpo = lineas.slice(3, lineas.length - 2);
  const headers = {};
  for (const linea of cuerpo) {
    const corte = linea.indexOf(':');
    if (corte > 0) headers[linea.slice(0, corte).toLowerCase()] = linea.slice(corte + 1);
  }
  return { method: lineas[0], uri: lineas[1], query: lineas[2], payloadHash, headers };
}

function leerAuthorization(texto) {
  const linea = texto.split('\n').find((l) => l.toLowerCase().startsWith('authorization:'));
  return linea ? linea.slice(linea.indexOf(':') + 1).trim() : '';
}

const nombres = readdirSync(suite, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/* El objetivo de la ruta hay que sacarlo con cuidado: puede tener espacios
   ("GET /example space/ HTTP/1.1"), así que no se puede partir por espacios. */
function leerObjetivo(linea) {
  const fin = linea.lastIndexOf(' HTTP/');
  const finRequest = fin >= 0 ? fin : linea.length;
  return linea.slice(linea.indexOf(' ') + 1, finRequest);
}

console.log(`\n── Suite oficial de AWS (${nombres.length} casos) ──\n`);

let firmasIguales = 0;
let sinNormalizar = 0;

for (const nombre of nombres) {
  const carpeta = join(suite, nombre);
  const requeridos = ['context.json', 'request.txt', 'header-canonical-request.txt', 'header-signed-request.txt'];
  if (!requeridos.every((a) => existsSync(join(carpeta, a)))) { omitidos++; continue; }

  const contexto = JSON.parse(readFileSync(join(carpeta, 'context.json'), 'utf8'));
  const canonico = leerCanonico(readFileSync(join(carpeta, 'header-canonical-request.txt'), 'utf8'));
  const esperado = leerAuthorization(readFileSync(join(carpeta, 'header-signed-request.txt'), 'utf8'));

  // El firmante de R2 nunca lleva query string: S3 no las usa en estas rutas.
  if (canonico.query) { omitidos++; continue; }

  const textoRequest = readFileSync(join(carpeta, 'request.txt'), 'utf8');
  const lineaRequest = textoRequest.split('\n')[0] || '';
  const metodo = lineaRequest.slice(0, lineaRequest.indexOf(' '));
  const ruta = leerObjetivo(lineaRequest);
  if (!metodo || !ruta) { omitidos++; continue; }

  const mHost = /^Host:\s*(\S+)/im.exec(textoRequest);
  const host = canonico.headers.host || (mHost ? mHost[1] : '');
  if (!host) { omitidos++; continue; }

  /* La suite canonicaliza la ruta en algunos casos (resuelve "./" y "../", o
     convierte caracteres sueltos a su forma escapada). S3 y R2 hacen lo
     contrario: firman la ruta tal cual, sin normalizar. Los casos "unnormalized"
     de la suite son los que corresponden a S3, y son los que se comparan. */
  if (contexto.normalize && canonico.uri !== ruta) {
    console.log(`N/A   ${nombre} — la suite canonicaliza la ruta (${ruta} -> ${canonico.uri}); S3/R2 firman la ruta tal cual`);
    sinNormalizar++;
    continue;
  }

  // Se pasan como extras todos los headers firmados salvo host y x-amz-date,
  // que el firmante ya pone siempre.
  const extras = {};
  for (const [clave, valor] of Object.entries(canonico.headers)) {
    if (clave !== 'host' && clave !== 'x-amz-date') extras[clave] = valor;
  }

  const headers = await sigV4Headers({
    method: metodo,
    host,
    path: ruta,
    region: contexto.region,
    service: contexto.service,
    accessKeyId: contexto.credentials.access_key_id,
    secretAccessKey: contexto.credentials.secret_access_key,
    payloadHash: canonico.payloadHash,
    signedExtraHeaders: extras,
    date: new Date(contexto.timestamp),
  });

  const ok = headers.Authorization === esperado;
  if (ok) firmasIguales++;
  comprobar(nombre, ok, `esperado: ${esperado}\n      obtenido: ${headers.Authorization}`);
}

/* ── 2) La forma de la petición que se manda a R2 ──────────────────────────────*/

console.log('\n── Petición contra R2 ──\n');

process.env.R2_ACCOUNT_ID = 'abc123';
process.env.R2_PUBLIC_BASE_URL = '';

const put = await sigV4Headers({
  method: 'PUT',
  host: 'abc123.r2.cloudflarestorage.com',
  path: '/pastoral-uploads/1790391300929-4x5im3zthgn2.png',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  date: new Date('2026-09-26T10:00:00Z'),
  signedExtraHeaders: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
});

const auth = put.Authorization || '';
comprobar('credencial con región "auto" y servicio "s3"', auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260926/auto/s3/aws4_request,'), auth);
comprobar('firma incluye x-amz-content-sha256', auth.includes('SignedHeaders=host;x-amz-content-sha256;x-amz-date'), auth);
comprobar('firma hexadecimal de 64 caracteres', /Signature=[0-9a-f]{64}$/.test(auth), auth);
comprobar('x-amz-date en formato ISO básico', put['x-amz-date'] === '20260926T100000Z', put['x-amz-date']);
comprobar('payload sin firmar, para poder transmitir en streaming', put['x-amz-content-sha256'] === 'UNSIGNED-PAYLOAD');

/* ── 3) Determinismo ─────────────────────────────────────────────────────────*/

console.log('\n── Determinismo ──\n');

const misma = {
  method: 'PUT',
  host: 'abc123.r2.cloudflarestorage.com',
  path: '/pastoral-uploads/x.png',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  date: new Date('2026-09-26T10:00:00Z'),
  signedExtraHeaders: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
};
const firmaA = (await sigV4Headers(misma)).Authorization;
const firmaB = (await sigV4Headers(misma)).Authorization;
comprobar('misma entrada, misma firma', firmaA === firmaB);
comprobar('otro archivo, otra firma', (await sigV4Headers({ ...misma, path: '/pastoral-uploads/y.png' })).Authorization !== firmaA);

/* ── 4) Armado de las URL públicas ────────────────────────────────────────────*/

console.log('\n── URL públicas del bucket ──\n');

comprobar('base pública automática', r2PublicBaseUrl() === 'https://pub-abc123.r2.dev/pastoral-uploads', r2PublicBaseUrl());
comprobar(
  'codifica espacios y conserva las barras',
  r2PublicUrl('carpeta con espacio/archivo.jpg') === 'https://pub-abc123.r2.dev/pastoral-uploads/carpeta%20con%20espacio/archivo.jpg',
  r2PublicUrl('carpeta con espacio/archivo.jpg'),
);
comprobar('extrae la clave de /api/files', r2KeyFromUrl('/api/files/1790391300929-4x5im3zthgn2.png') === '1790391300929-4x5im3zthgn2.png');
comprobar('extrae la clave de una URL de r2.dev', r2KeyFromUrl('https://pub-abc123.r2.dev/pastoral-uploads/logo.png') === 'logo.png');
comprobar('ignora la query al extraer la clave', r2KeyFromUrl('/api/files/logo.png?v=2') === 'logo.png');
comprobar('no inventa clave para una URL externa', r2KeyFromUrl('https://ejemplo.com/foto.png') === '');

process.env.R2_PUBLIC_BASE_URL = 'https://media.ejemplo.org/';
comprobar('respeta R2_PUBLIC_BASE_URL y le quita la barra final', r2PublicBaseUrl() === 'https://media.ejemplo.org', r2PublicBaseUrl());
comprobar('arma URL con dominio propio', r2PublicUrl('logo.png') === 'https://media.ejemplo.org/logo.png');
comprobar('extrae la clave de un dominio propio', r2KeyFromUrl('https://media.ejemplo.org/logo.png') === 'logo.png');

rmSync(temporal, { recursive: true, force: true });

console.log(
  `\nFirmas idénticas a las de AWS: ${firmasIguales}.` +
  `\nCasos de normalización de ruta (S3/R2 no normalizan): ${sinNormalizar}.` +
  `\nCasos omitidos por usar query string: ${omitidos}.`,
);
console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
