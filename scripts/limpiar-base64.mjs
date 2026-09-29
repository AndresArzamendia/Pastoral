/**
 * Quita de la base de datos las imágenes en base64 que quedaron embebidas.
 *
 * A diferencia de migrar-imagenes-a-r2.mjs, esto NO sube las imágenes a R2:
 * las ELIMINA del contenido (los archivos de verdad viven en el bucket y acá
 * solo debería quedar su dirección). Si un campo guardó una data URL, se borra
 * ese campo (queda vacío) para que la base deje de pesar y de descargar el
 * base64 a cada visitante.
 *
 * Necesita la clave de servicio para saltar RLS (solo sirve para escribir):
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/limpiar-base64.mjs --aplicar
 *
 *   node scripts/limpiar-base64.mjs             # simula, no escribe nada
 *   node scripts/limpiar-base64.mjs --aplicar   # escribe de verdad
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

const argumentos = process.argv.slice(2);
const aplicar = argumentos.includes('--aplicar');

function leerEnv(archivo) {
  if (!existsSync(archivo)) return {};
  const valores = {};
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(linea);
    if (m) valores[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return valores;
}

const env = { ...leerEnv(join(raiz, '.env.production')), ...leerEnv(join(raiz, '.env.local')), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  La clave de servicio va en la variable SUPABASE_SERVICE_ROLE_KEY de .env.local\n' +
      '  (Supabase · Project Settings · API · service_role). Solo hace falta para escribir.',
  );
  process.exit(1);
}

/** Forma "quita y reemplaza" recursiva: toda string que empiece con data: se borra. */
function limpiar(value) {
  if (typeof value === 'string') {
    return value.startsWith('data:') ? '' : value;
  }
  if (Array.isArray(value)) return value.map(limpiar);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = limpiar(v);
    return out;
  }
  return value;
}

const cabeceras = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const base = SUPABASE_URL.replace(/\/$/, '');

const res = await fetch(`${base}/rest/v1/pjl_store?select=key,value`, { headers: cabeceras });
if (!res.ok) throw new Error(`No se pudo leer pjl_store: ${res.status} ${await res.text()}`);
const filas = await res.json();

const plan = [];
let totalQuitado = 0;

for (const fila of filas) {
  if (fila.value === null || fila.value === undefined) continue;
  const texto = JSON.stringify(fila.value);
  const antes = Buffer.byteLength(texto);
  if (!texto.includes('data:')) continue;
  const limpio = limpiar(fila.value);
  const nuevoTexto = JSON.stringify(limpio);
  const despues = Buffer.byteLength(nuevoTexto);
  plan.push({ key: fila.key, limpio, antes, despues });
  totalQuitado += antes - despues;
}

if (plan.length === 0) {
  console.log('No quedan imágenes base64 en la base. Nada que limpiar.');
  process.exit(0);
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
console.log(`\n${aplicar ? 'LIMPIANDO' : 'SIMULANDO'} base de datos\n`);
for (const item of plan) {
  console.log(`  ${item.key.padEnd(20)} ${kb(item.antes).padStart(9)}  ->  ${kb(item.despues).padStart(9)}`);
}
console.log(`\n  Base de datos: ${kb(totalQuitado)} menos.\n`);

if (!aplicar) {
  console.log('  Esto fue una simulación. Corré con --aplicar (y SUPABASE_SERVICE_ROLE_KEY) para hacerlo de verdad.');
  process.exit(0);
}

for (const item of plan) {
  const r = await fetch(`${base}/rest/v1/pjl_store?key=eq.${encodeURIComponent(item.key)}`, {
    method: 'PATCH',
    headers: { ...cabeceras, Prefer: 'return=representation' },
    body: JSON.stringify({ value: item.limpio }),
  });
  if (!r.ok) throw new Error(`No se pudo guardar "${item.key}": ${r.status} ${await r.text()}`);
  const filasR = await r.json().catch(() => null);
  if (!Array.isArray(filasR) || filasR.length === 0) {
    throw new Error(`La base no devolvió la fila "${item.key}" tras actualizarla (¿la clave es de servicio?).`);
  }
  console.log(`  guardada la clave "${item.key}"`);
}

console.log('\n  Listo. La base ya no guarda imágenes base64.');