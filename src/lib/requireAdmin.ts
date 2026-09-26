import { NextResponse } from 'next/server';

/**
 * Autenticación de servidor para las rutas del panel.
 *
 * Antes estas rutas no comprobaban nada: cualquiera que copiara el token público
 * de Supabase en una URL podía cambiar el contenido del sitio, subir archivos o
 * borrar las estadísticas.
 *
 * Ahora el navegador no dice "soy el administrador": entrega el token de sesión
 * que le dio Supabase al iniciar sesión, y el servidor se lo devuelve a Supabase
 * para comprobarlo. El rol se lee de la tabla de perfiles, así que depende de la
 * base de datos y no de lo que diga el navegador.
 */

export type AdminRole = 'superadmin' | 'desarrollador' | 'editor' | 'viewer';

export interface AdminSession {
  email: string;
  name: string;
  role: AdminRole;
}

/** Roles con permiso para modificar el sitio. */
const WRITE_ROLES: AdminRole[] = ['superadmin', 'desarrollador'];

/** Tablas de perfiles admitidas, por si el proyecto usa un nombre u otro. */
const PROFILE_TABLES = ['user_profiles', 'profiles'] as const;

type Config = { url: string; key: string; serviceKey: string | null };

function getConfig(): Config | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key, serviceKey };
}

const knownRoles = (value: unknown): AdminRole =>
  value === 'superadmin' || value === 'desarrollador' || value === 'editor' || value === 'viewer'
    ? value
    : 'viewer';

interface AuthUser {
  email?: string;
  user_metadata?: { name?: string; full_name?: string };
}

/**
 * Cache corta: las peticiones del panel llegan en ráfaga y el rol cambia muy poco.
 * 60 segundos alcanzan y ahorran una consulta por cada guardado.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { session: AdminSession; expires: number }>();

function fail(status: number, message: string) {
  return { ok: false as const, response: NextResponse.json({ error: message }, { status }) };
}

async function verifyToken(config: Config, token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Lee el perfil de la cuenta desde la base de datos.
 *
 * Se consulta con el token del propio usuario, no con la clave pública sola: así,
 * cuando la tabla quede protegida, el servidor sigue leyendo el perfil y nunca
 * acepta un rol que venga del navegador. Si algún día hay clave de servicio
 * (SUPABASE_SERVICE_ROLE_KEY), se usa esa para leer la fila sin depender de RLS.
 */
async function readProfile(config: Config, email: string, token: string) {
  const authHeader = config.serviceKey ? config.serviceKey : token;
  for (const table of PROFILE_TABLES) {
    try {
      const url =
        `${config.url}/rest/v1/${table}` +
        `?email=eq.${encodeURIComponent(email)}&select=name,email,role,status&limit=1`;
      const res = await fetch(url, {
        headers: { apikey: config.key, Authorization: `Bearer ${authHeader}` },
        cache: 'no-store',
      });
      if (res.status === 404) continue; // esa tabla no existe en el proyecto
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch {
      return null;
    }
  }
  return null;
}

export type AuthorizeResult =
  | { ok: true; session: AdminSession; token: string }
  | { ok: false; response: NextResponse };

/**
 * Devuelve la sesión del administrador si el token es válido y la cuenta puede
 * hacer lo que pide la ruta. Si algo falla, devuelve la respuesta de error lista
 * para devolver.
 *
 *   const auth = await authorizeAdmin(request);
 *   if (!auth.ok) return auth.response;
 *   // acá se puede usar auth.session.email
 */
export async function authorizeAdmin(
  request: Request,
  options: { write?: boolean } = {}
): Promise<AuthorizeResult> {
  const config = getConfig();
  if (!config) return fail(503, 'El servidor no tiene configurado el acceso a Supabase.');

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return fail(401, 'Necesitás iniciar sesión en el panel para hacer esto.');
  }

  const cached = cache.get(token);
  if (cached && cached.expires > Date.now()) {
    if (options.write && !WRITE_ROLES.includes(cached.session.role)) {
      return fail(403, 'Tu cuenta puede ver el panel, pero no modificar el contenido.');
    }
    return { ok: true, session: cached.session, token };
  }

  const user = await verifyToken(config, token);
  if (!user?.email) {
    cache.delete(token);
    return fail(401, 'Tu sesión venció o no es válida. Volvé a iniciar sesión.');
  }

  const profile = await readProfile(config, user.email, token);
  if (!profile) {
    return fail(403, 'Tu usuario no tiene un perfil de acceso en el sistema.');
  }
  if (String(profile.status || '') !== 'activo') {
    return fail(403, 'Tu cuenta no está activa. Pedile permiso a quien administra el sitio.');
  }

  const role = knownRoles(profile.role);
  const session: AdminSession = {
    email: String(profile.email || user.email).toLowerCase(),
    name: String(profile.name || user.user_metadata?.name || user.user_metadata?.full_name || user.email),
    role,
  };
  cache.set(token, { session, expires: Date.now() + CACHE_TTL_MS });

  if (options.write && !WRITE_ROLES.includes(role)) {
    return fail(403, 'Tu cuenta puede ver el panel, pero no modificar el contenido.');
  }

  return { ok: true, session, token };
}

/**
 * Igual que authorizeAdmin, pero no deja pasar a un rol sin permiso aunque ya
 * haya un resultado guardado en la caché.
 */
export async function requireAdminWriter(request: Request) {
  return authorizeAdmin(request, { write: true });
}
