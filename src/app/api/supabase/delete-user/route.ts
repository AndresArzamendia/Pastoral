import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminWriter } from '@/lib/requireAdmin';

const PROFILE_TABLES = ['user_profiles', 'profiles'] as const;
type ProfileTableName = (typeof PROFILE_TABLES)[number];

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function findProfileTable(supabase: any): Promise<ProfileTableName> {
  for (const table of PROFILE_TABLES) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (!error) return table;
    const message = error?.message?.toLowerCase() || '';
    if (message.includes('could not find the table') || message.includes('relation') || message.includes('table does not exist')) {
      continue;
    }
    throw error;
  }
  throw new Error(`No se encontró ninguna tabla de perfiles válida en Supabase. Crea una tabla llamada ${PROFILE_TABLES.join(' o ')}.`);
}

export async function POST(request: Request) {
  // Operacion del panel: exige sesion iniciada.
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; 
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ success: false, message: 'Las variables de entorno de Supabase no están configuradas correctamente.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const profileId = body?.profileId;
  const authUid = body?.authUid;

  if (!profileId || typeof profileId !== 'string') {
    return NextResponse.json({ success: false, message: 'Falta el ID del perfil a eliminar.' }, { status: 400 });
  }

  if (!isValidUuid(profileId)) {
    return NextResponse.json({ success: false, message: 'El ID del perfil no es un UUID válido. No se puede eliminar.', }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: { persistSession: false },
  });

  let deleteAuthError: string | null = null;
  let skipAuthDeletion = false;

  if (authUid) {
    if (!serviceRoleKey) {
      skipAuthDeletion = true;
    } else {
      const { error } = await supabase.auth.admin.deleteUser(authUid);
      if (error) {
        deleteAuthError = error.message;
      }
    }
  }

  let tableName: ProfileTableName;
  try {
    tableName = await findProfileTable(supabase);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'No se encontró tabla de perfiles en Supabase.' }, { status: 500 });
  }

  const { error: deleteError } = await supabase.from(tableName).delete().eq('id', profileId);
  if (deleteError) {
    return NextResponse.json({ success: false, message: deleteError.message || 'Error al eliminar el perfil.' }, { status: 500 });
  }

  const message = deleteAuthError
    ? `Perfil eliminado de la tabla, pero no se pudo borrar la cuenta de autenticación: ${deleteAuthError}`
    : skipAuthDeletion
      ? 'Perfil eliminado de la tabla de perfiles. No se borró la cuenta de autenticación porque falta SUPABASE_SERVICE_ROLE_KEY.'
      : 'Usuario eliminado correctamente de Supabase.';

  return NextResponse.json({ success: true, message });
}
