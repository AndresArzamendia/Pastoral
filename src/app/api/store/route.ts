import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWriter } from '@/lib/requireAdmin';

export const dynamic = 'force-dynamic';

/**
 * Escrituras del contenido del sitio (identidad, apariencia, comunidades,
 * noticias del carrusel, documentos…).
 *
 * Antes el navegador escribía directamente en la tabla pjl_store usando el token
 * público de Supabase, que está visible en el código de la web: eso permitía
 * cambiar el contenido del sitio a cualquiera que copiara ese token.
 *
 * Ahora la escritura pasa por acá, el servidor comprueba la sesión y recién
 * después guarda. El valor se manda con el token del usuario, así también se
 * puede aplicar la seguridad de Supabase (RLS) más adelante si se quiere.
 */

/* Solo se admiten estas claves: nada de escribir filas nuevas a medida.
   'news' y 'gallery' estaban fuera de la lista: el panel sí los guardaba, pero
   el servidor los rechazaba, así que esos cambios se quedaban solo en el
   navegador que los hizo y los demás dispositivos veían la versión vieja. */
const ALLOWED_KEYS = new Set([
  'branding', 'theme', 'users', 'hero', 'heroInterval', 'chapels', 'stats',
  'devices', 'logs', 'meta_updated', 'sections', 'content', 'docs', 'faq',
  'social', 'profiles', 'notifications', 'activities', 'newsletter',
  'news', 'gallery',
]);

/* Los archivos grandes van a R2; en el contenido no debería haber nada enorme. */
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

/**
 * Quita imágenes en base64 (data:...;base64,...) del valor antes de guardarlo.
 *
 * Estas imágenes no deberían entrar nunca a la base: históricamente la llenaron
 * a 4 MB y cada visitante descargaba ese peso. Los archivos se suben a R2 y acá
 * solo queda la dirección. Si un valor trae una image data URL (por ejemplo
 * porque el navegador del panel guardaba base64 en localStorage), se elimina
 * con un aviso en vez de guardar el texto enorme.
 */
function stripDataUrls(value: unknown, count: { n: number }): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      count.n++;
      return '';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripDataUrls(v, count));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripDataUrls(v, count);
    }
    return out;
  }
  return value;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  let body: { key?: unknown; value?: unknown };
  try {
    body = (await request.json()) as { key?: unknown; value?: unknown };
  } catch {
    return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'Esa clave no se puede guardar.' }, { status: 400 });
  }
  if (body.value === undefined) {
    return NextResponse.json({ error: 'Falta el valor a guardar.' }, { status: 400 });
  }

  // Las imágenes embebidas en base64 no se guardan: se borran (los archivos
  // de verdad viven en R2 y se guardan sus direcciones, no su contenido).
  const removidas = { n: 0 };
  const limpio = stripDataUrls(body.value, removidas);
  if (removidas.n > 0) {
    console.warn(`api/store: se quitaron ${removidas.n} imagen(es) en base64 de "${key}" (no se guardan en la base).`);
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(limpio);
  } catch {
    return NextResponse.json({ error: 'El valor no se puede guardar.' }, { status: 400 });
  }
  if (serialized.length > MAX_VALUE_BYTES) {
    return NextResponse.json(
      { error: 'Ese contenido es demasiado grande. Subilo como archivo desde la sección correspondiente.' },
      { status: 413 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key2 =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key2) {
    return NextResponse.json({ error: 'El servidor no tiene configurado el acceso a Supabase.' }, { status: 503 });
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/pjl_store?key=eq.${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        apikey: key2,
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ key, value: limpio }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('api/store: Supabase respondió', res.status, detail.slice(0, 300));
      return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, key, savedBy: auth.session.email, base64Removidas: removidas.n });
  } catch (e) {
    console.error('api/store:', (e as Error).message);
    return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 502 });
  }
}
