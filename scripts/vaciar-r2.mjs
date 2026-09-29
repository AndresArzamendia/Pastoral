/**
 * VACÍA el bucket de Cloudflare R2 de archivos sueltos.
 *
 * Borra TODOS los objetos del bucket para empezar de cero: las imágenes que
 * quedaron de la migración y las subidas de prueba. Las filas de la base que
 * apunten a /api/files/<clave> van a quedar sin archivo hasta que se vuelvan a
 * subir desde el panel.
 *
 * Necesita sesión de Cloudflare:
 *   wrangler login
 *   node scripts/vaciar-r2.mjs            # simula, solo lista
 *   node scripts/vaciar-r2.mjs --aplicar  # borra de verdad
 *
 * Opciones:
 *   --bucket=<nombre>  Bucket a vaciar (por defecto pastoral-uploads).
 */

import { execFileSync } from 'node:child_process';
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

const BUCKET = valorDe('bucket', 'pastoral-uploads');

function wrangler(args, opciones = {}) {
  return execFileSync(
    process.execPath,
    [join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args],
    { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opciones },
  );
}

/** Lista de claves: algunas versiones imprimen una clave por línea, otras JSON. */
function leerClaves(salida) {
  const claves = [];
  for (const linea of salida.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t) continue;
    let clave = t;
    if (t.startsWith('{')) {
      try {
        clave = JSON.parse(t).key || t;
      } catch { /* no era JSON */ }
    }
    if (clave) claves.push(clave);
  }
  return claves;
}

console.log(`\n${aplicar ? 'VACIANDO' : 'SIMULANDO'} bucket ${BUCKET}\n`);

let salida;
try {
  salida = wrangler(['r2', 'object', 'list', BUCKET, '--remote']);
} catch (e) {
  console.error('No se pudo listar el bucket:\n' + (e.stderr || e.message));
  process.exit(1);
}

const claves = leerClaves(salida);
if (claves.length === 0) {
  console.log('El bucket está vacío. Nada que hacer.');
  process.exit(0);
}

console.log(`Encontrados ${claves.length} objeto(s):`);
for (const c of claves) console.log('  ' + c);

if (!aplicar) {
  console.log('\n  Simulación: no se borró nada. Corré de nuevo con --aplicar para vaciar.');
  process.exit(0);
}

let ok = 0;
for (const c of claves) {
  try {
    wrangler(['r2', 'object', 'delete', `${BUCKET}/${c}`, '--remote'], { stdio: ['ignore', 'pipe', 'pipe'] });
    ok++;
    console.log(`  ✗ ${c}`);
  } catch (e) {
    console.log(`  ! no se pudo borrar ${c}: ${(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}

console.log(`\n  Borrados ${ok}/${claves.length}. Listo para subir todo de nuevo desde el panel.`);