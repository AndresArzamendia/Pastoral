import { NextResponse } from 'next/server';
import { requireAdminWriter } from '@/lib/requireAdmin';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLES = ['user_profiles', 'profiles'] as const;

const ROLES = ['superadmin', 'desarrollador', 'editor', 'viewer'] as const;
const STATUS = ['activo', 'pendiente', 'suspendido'] as const;

/** Campos que el panel puede cambiar. El id y el email nunca se tocan. */
const EDITABLE = ['name', 'role', 'status', 'permissions'] as const;

function pickString(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

/**
 * Cambios de los perfiles de acceso (aprobar una cuenta, cambiar su rol).
 *
 * Antes el navegador escribía en la tabla de perfiles con el token público de
 * Supabase, así que cualquiera que abriera la consola del navegador podía
 * escribirse "desarrollador" a sí mismo. Ahora la escritura pasa por acá y el
 * servidor exige una sesión con permiso de modificación.
 */
export async function PATCH(request: Request) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  const config = getSupabaseRouteConfig();
  if (!config) return missingSupabaseConfigResponse();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  const profileId = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!profileId) {
    return NextResponse.json({ error: 'Falta el id del perfil.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  const name = typeof body?.name === 'string' ? body.name.trim() : null;
  if (name) updates.name = name;

  if (body?.role !== undefined) {
    const role = pickString(body.role, ROLES);
    if (!role) {
      return NextResponse.json({ error: 'Rol desconocido.' }, { status: 400 });
    }
    updates.role = role;
  }

  if (body?.status !== undefined) {
    const status = pickString(body.status, STATUS);
    if (!status) {
      return NextResponse.json({ error: 'Estado desconocido.' }, { status: 400 });
    }
    updates.status = status;
  }

  if (body?.permissions !== undefined) {
    if (!Array.isArray(body.permissions) || body.permissions.some((p: unknown) => typeof p !== 'string')) {
      return NextResponse.json({ error: 'Permisos inválidos.' }, { status: 400 });
    }
    updates.permissions = body.permissions;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No enviaste ningún cambio.' }, { status: 400 });
  }

  const headers: Record<string, string> = {
    apikey: config.key,
    // Se reenvía el token del usuario, no la clave pública: así la base de
    // datos ve quién escribe y aplica sus propias reglas de permiso.
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  for (const table of TABLES) {
    const res = await fetch(`${config.url}/rest/v1/${table}?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    }).catch(() => null);

    if (res?.status === 404) continue; // esa tabla no existe en el proyecto
    if (!res || !res.ok) {
      return NextResponse.json({ error: 'No se pudo guardar el perfil.' }, { status: 502 });
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (Array.isArray(rows) && rows.length) {
      return NextResponse.json({ success: true, profile: rows[0] });
    }
  }

  return NextResponse.json({ error: 'No se encontró el perfil.' }, { status: 404 });
}
