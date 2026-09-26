import { getSupabaseClient } from './supabase';
import { siteUrlOf } from './siteUrl';
import { adminFetch } from './adminAuth';
import type { SupabaseClient } from '@supabase/supabase-js';

const PROFILE_TABLES = ['user_profiles', 'profiles'] as const;
type ProfileTableName = (typeof PROFILE_TABLES)[number];
let cachedProfileTable: ProfileTableName | null = null;

export interface SupabaseProfile {
  id: string;
  auth_uid: string;
  name: string;
  email: string;
  role: 'desarrollador' | 'editor' | 'viewer';
  status: 'pendiente' | 'activo' | 'inactivo';
  permissions?: string[];
  created_at?: string;
}

function normalizeError(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'object' && error !== null) {
    return (error as any).message?.toString().toLowerCase()
      || (error as any).details?.toString().toLowerCase()
      || JSON.stringify(error).toLowerCase();
  }
  return String(error).toLowerCase();
}

function isMissingTableError(error: unknown) {
  const message = normalizeError(error);
  return message.includes('could not find the table')
    || message.includes('schema cache')
    || message.includes('relation "public.user_profiles" does not exist')
    || message.includes('relation "public.profiles" does not exist')
    || message.includes('table does not exist');
}

async function getProfileTableName(supabase: SupabaseClient): Promise<ProfileTableName> {
  if (cachedProfileTable) return cachedProfileTable;

  for (const table of PROFILE_TABLES) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (!error) {
      cachedProfileTable = table;
      return table;
    }
    if (isMissingTableError(error)) {
      continue;
    }
    throw error;
  }

  throw new Error(
    `No se encontró ninguna tabla de perfiles válida en Supabase. Crea una tabla llamada ${PROFILE_TABLES.join(' o ')} en tu proyecto Supabase.`
  );
}

export async function signUpProfile(name: string, email: string, password: string, emailRedirectTo?: string) {
  const supabase = getSupabaseClient();

  let tableName: ProfileTableName;
  try {
    tableName = await getProfileTableName(supabase);
  } catch (tableError) {
    return { error: tableError as Error };
  }

  const { data: existingProfile, error: existingError } = await supabase
    .from(tableName)
    .select('id, status')
    .eq('email', email)
    .maybeSingle();

  if (existingError) {
    console.error('Supabase signUpProfile check error:', existingError.message);
  }
  if (existingProfile) {
    const message = existingProfile.status === 'pendiente'
      ? 'Ya existe una solicitud pendiente para este correo.'
      : 'Este correo ya está registrado.';
    return { error: new Error(message) };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: 'viewer', status: 'pendiente' },
      emailRedirectTo: emailRedirectTo || undefined,
    }
  });

  if (error) {
    return { error };
  }

  const authUid = data.user?.id;
  if (!authUid) {
    return { error: new Error('No se obtuvo el UID de Supabase al registrar al usuario.') };
  }

  const { error: profileError } = await supabase.from(tableName).insert({
    auth_uid: authUid,
    email,
    name,
    role: 'viewer',
    status: 'pendiente',
    permissions: ['dashboard'],
  });
  if (profileError) {
    if (isMissingTableError(profileError)) {
      return { error: new Error('No se encontró la tabla de perfiles en Supabase. Ejecuta supabase-schema.sql para crear user_profiles o profiles y vuelve a intentar.') };
    }
    return { error: profileError };
  }

  return { error: null };
}

type SupabaseProfileChangePayload = {
  new?: SupabaseProfile;
  old?: SupabaseProfile;
  eventType?: string;
};

let profileChannelSeq = 0;

export function subscribeProfileChanges(
  onChange: (profile: SupabaseProfile, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
): () => void {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    return () => {};
  }

  let disposed = false;
  let cleanup: (() => void) | null = null;

  // Topic único por suscripción: supabase-js 2.108 reutiliza el canal si el
  // topic ya existe, y un .on() posterior al subscribe() rompe la página.
  const topic = `profile_changes_${++profileChannelSeq}`;

  getProfileTableName(supabase)
    .then((tableName) => {
      if (disposed) return;
      const channel = (supabase.channel(topic) as any).on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload: SupabaseProfileChangePayload) => {
          const profile = payload.new ?? payload.old;
          if (!profile) return;
          const eventType = (payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE') || (payload.new ? 'INSERT' : 'UPDATE');
          onChange(profile, eventType);
        }
      );

      (channel as any).subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })
    .catch((err) => {
      console.error('subscribeProfileChanges error:', err);
    });

  return () => {
    disposed = true;
    if (cleanup) cleanup();
  };
}

export async function signInProfile(email: string, password: string) {
  const supabase = getSupabaseClient();
  const result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    return result;
  }

  if (result.data?.session?.user) {
    return result;
  }

  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error) {
    return { data: result.data, error: sessionResult.error };
  }

  return { data: { ...result.data, session: sessionResult.data.session }, error: null };
}

export async function fetchProfileByEmail(email: string): Promise<SupabaseProfile | null> {
  const supabase = getSupabaseClient();
  let tableName: ProfileTableName;
  try {
    tableName = await getProfileTableName(supabase);
  } catch (error) {
    console.error('Supabase fetchProfileByEmail error:', error);
    return null;
  }

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    console.error('Supabase fetchProfileByEmail error:', error.message);
    return null;
  }

  return data as SupabaseProfile;
}

export async function fetchPendingProfiles(): Promise<SupabaseProfile[]> {
  const supabase = getSupabaseClient();
  let tableName: ProfileTableName;
  try {
    tableName = await getProfileTableName(supabase);
  } catch (error) {
    console.error('Supabase fetchPendingProfiles error:', error);
    return [];
  }

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Supabase fetchPendingProfiles error:', error.message);
    return [];
  }

  return data as SupabaseProfile[];
}

export async function approveProfile(profileId: string): Promise<boolean> {
  // Aprobar una cuenta es una acción del panel: la hace el servidor, que
  // comprueba la sesión. Antes se escribía desde el navegador con el token
  // público, y eso dejaba cambiar el estado de cualquier cuenta.
  return updateProfile(profileId, { status: 'activo' } as Partial<SupabaseProfile>);
}

export async function updateAuthUser(email?: string, password?: string) {
  const supabase = getSupabaseClient();
  return supabase.auth.updateUser({ email, password });
}

export async function fetchAllProfiles(): Promise<SupabaseProfile[]> {
  const supabase = getSupabaseClient();
  let tableName: ProfileTableName;
  try {
    tableName = await getProfileTableName(supabase);
  } catch (error) {
    console.error('Supabase fetchAllProfiles error:', error);
    return [];
  }

  const { data, error } = await supabase.from(tableName).select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Supabase fetchAllProfiles error:', error.message);
    return [];
  }
  return data as SupabaseProfile[];
}

export async function updateProfile(profileId: string, updates: Partial<SupabaseProfile>) {
  // Va por el servidor: el rol y el estado los decide una sesión autorizada.
  try {
    const payload: Record<string, unknown> = { id: profileId };
    if (typeof updates.name === 'string') payload.name = updates.name;
    if (typeof updates.role === 'string') payload.role = updates.role;
    if (typeof updates.status === 'string') payload.status = updates.status;
    if (Array.isArray(updates.permissions)) payload.permissions = updates.permissions;

    const response = await adminFetch('/api/profiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      console.error('Supabase updateProfile failed:', result?.error || response.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Supabase updateProfile error:', error);
    return false;
  }
}

export async function deleteProfile(profileId: string, authUid?: string) {
  try {
    const response = await adminFetch('/api/supabase/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, authUid }),
    });
    const result = await response.json();

    if (!response.ok) {
      console.error('Supabase deleteProfile failed:', result?.message || response.statusText);
      return { success: false, message: result?.message || 'Error al eliminar el perfil.' };
    }

    return { success: result?.success === true, message: result?.message };
  } catch (error) {
    console.error('Supabase deleteProfile failed:', error);
    return { success: false, message: String(error) };
  }
}

export async function resendVerificationEmail(email: string, redirectTo?: string) {
  try {
    const response = await fetch('/api/supabase/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo: redirectTo || siteUrlOf('/confirmation?success=true') }),
    });
    const result = await response.json();

    if (!response.ok) {
      console.error('Supabase resendVerificationEmail failed:', result?.message || response.statusText);
      return { success: false, message: result?.message || 'Error al reenviar el correo de verificación.' };
    }

    return { success: result?.success === true, message: result?.message || 'Correo de verificación reenviado. Revisa tu bandeja de entrada (y spam).' };
  } catch (error) {
    console.error('Supabase resendVerificationEmail failed:', error);
    return { success: false, message: String(error) };
  }
}

export async function requestPasswordReset(email: string, redirectTo?: string) {
  try {
    const response = await fetch('/api/supabase/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo: redirectTo || siteUrlOf('/reset-password/recover') }),
    });
    const result = await response.json();

    if (!response.ok) {
      console.error('Supabase requestPasswordReset failed:', result?.message || response.statusText);
      return { success: false, message: result?.message || 'Error al enviar el correo de recuperación.' };
    }

    return { success: result?.success === true, message: result?.message || 'Correo de recuperación enviado. Revisa tu bandeja de entrada (y spam).' };
  } catch (error) {
    console.error('Supabase requestPasswordReset failed:', error);
    return { success: false, message: String(error) };
  }
}
