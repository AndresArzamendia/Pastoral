/**
 * Caché del runtime de Cloudflare Workers (`caches.default`).
 *
 * En `workers.dev` la respuesta de un Worker NO pasa por un CDN, así que sin
 * esto cada visita ejecuta la ruta completa: consulta a Supabase, fetch al
 * Vaticano, etc. Con esta caché el origen se ejecuta una vez cada `ttl`
 * segundos en lugar de una vez por visitante.
 *
 * No cambia el contenido: se devuelve exactamente el mismo `Response` que
 * habría generado la ruta, byte a byte (mismos status, headers y cuerpo).
 */

type WorkerCache = {
  match: (req: Request) => Promise<Response | undefined>;
  put: (req: Request, res: Response) => Promise<void>;
};

function workerCache(): WorkerCache | null {
  const c = (globalThis as { caches?: { default?: WorkerCache } }).caches;
  return c?.default ?? null;
}

/** 5 minutos: suficiente para multiplicar por ~100 el número de visitas que
 *  tolerate el mismo origen, sin que una novedad tarde en verse. */
export const EDGE_TTL_SECONDS = 300;

/**
 * Envuelve un handler GET: sirve la copia cacheada si existe y, si no, ejecuta
 * `build`, guarda el resultado y lo devuelve. Si la caché no está disponible
 * (Node en local) o falla, el comportamiento es exactamente el de siempre.
 */
export async function withEdgeCache(
  request: Request,
  build: () => Promise<Response>,
  ttlSeconds: number = EDGE_TTL_SECONDS,
): Promise<Response> {
  const cache = workerCache();
  if (!cache) return build();

  const key = new Request(request.url, { method: 'GET' });
  try {
    const hit = await cache.match(key);
    if (hit) return hit;
  } catch { /* si la caché falla, se sigue calculando */ }

  const res = await build();
  // Nunca cachear errores: si Supabase falla una vez, un 503 quedaría clavado
  // durante todo el TTL y la web se vería caída sin motivo.
  if (!res.ok) return res;
  try {
    // Se cachea una copia; la respuesta que se devuelve al visitante no se toca.
    const copy = res.clone();
    copy.headers.set('Cache-Control', `public, s-maxage=${ttlSeconds}, stale-while-revalidate=60`);
    await cache.put(key, copy);
  } catch { /* si no se puede guardar, se devuelve igual */ }
  return res;
}
