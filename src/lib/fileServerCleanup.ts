import { r2KeyFromUrl } from '@/lib/r2';
import { getFileStorage } from '@/lib/uploadStorage';

/**
 * Borrado de archivos desde el servidor.
 *
 * El gemelo de src/lib/fileCleanup.ts, que funciona en el navegador. Hace falta
 * aparte para los datos que no viven en las claves del panel: las noticias están
 * en la tabla news_articles de Supabase y se editan por su propia API, así que el
 * borrado de la base no pasa por useLS() y hay que hacerlo explícitamente.
 *
 * Como en el navegador, nunca tira: si el bucket no está disponible o el archivo no
 * se puede borrar, la operación que lo acompañaba (borrar la fila) ya está hecha y
 * tiene que completarse igual. Que quede un archivo de más es un problema de espacio;
 * que el artículo no se pueda borrar, no.
 */
export async function deleteStoredUrls(urls: unknown): Promise<{ borrados: number; omitidos: number }> {
  const lista = (Array.isArray(urls) ? urls : [urls]).filter(
    (u): u is string => typeof u === 'string' && u.length > 0 && !u.startsWith('data:'),
  );
  if (lista.length === 0) return { borrados: 0, omitidos: 0 };

  /* Las direcciones que no son del bucket se cuentan aparte y se dejan como están.
     Sin este filtro, un artículo con la imagen de un CDN externo intentaría borrar
     en R2 una clave derivada de esa dirección. */
  const claves = [...new Set(lista.map(r2KeyFromUrl).filter((k): k is string => Boolean(k)))];
  if (claves.length === 0) return { borrados: 0, omitidos: lista.length };

  let storage;
  try {
    storage = await getFileStorage();
  } catch (error) {
    console.error('[archivos] el almacenamiento no está disponible:', error);
    return { borrados: 0, omitidos: claves.length };
  }
  if (!storage) return { borrados: 0, omitidos: claves.length };

  let borrados = 0;
  let omitidos = lista.length - claves.length;

  for (const clave of claves) {
    try {
      await storage.delete(clave);
      borrados++;
    } catch (error) {
      console.error(`[archivos] no se pudo borrar ${clave}:`, error);
      omitidos++;
    }
  }

  return { borrados, omitidos };
}

/** Junta imágenes de un valor que puede ser una dirección o una lista de ellas. */
export function aListaDeUrls(valor: unknown): string[] {
  if (typeof valor === 'string') return valor ? [valor] : [];
  if (Array.isArray(valor)) return valor.flatMap(aListaDeUrls);
  return [];
}