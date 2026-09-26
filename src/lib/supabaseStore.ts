import { getSupabaseClient } from './supabase';
import { adminFetch } from './adminAuth';

export const STORE_TABLE = 'pjl_store';

export async function fetchStoreValue<T>(key: string): Promise<T | null> {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (e) {
    console.warn('fetchStoreValue: Supabase not configured:', (e as Error).message);
    return null;
  }

  const { data, error } = await supabase
    .from(STORE_TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error('Supabase fetchStoreValue error:', error.message);
    return null;
  }

  return data?.value ?? null;
}

export async function fetchAllStoreValues<T>(keys: string[]): Promise<Record<string, T>> {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (e) {
    console.warn('fetchAllStoreValues: Supabase not configured:', (e as Error).message);
    return {} as Record<string, T>;
  }

  const { data, error } = await supabase
    .from(STORE_TABLE)
    .select('key, value')
    .in('key', keys);

  if (error) {
    console.error('Supabase fetchAllStoreValues error:', error.message);
    return {} as Record<string, T>;
  }

  return (data || []).reduce((acc: Record<string, T>, row: any) => {
    if (row?.key) acc[row.key] = row.value as T;
    return acc;
  }, {});
}

export async function fetchAllStoreRows(keys: string[]): Promise<Array<{ key: string; value: unknown; updatedAt?: string | null }>> {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (e) {
    console.warn('fetchAllStoreRows: Supabase not configured:', (e as Error).message);
    return [];
  }

  const { data, error } = await supabase
    .from(STORE_TABLE)
    .select('key, value')
    .in('key', keys);

  if (error) {
    console.error('Supabase fetchAllStoreRows error:', error.message);
    return [];
  }

  // La tabla pjl_store solo tiene (key, value): no hay columna updated_at, así
  // que pedirla hacía fallar la consulta entera y no se sincronizaba nada.
  return (data || []).map((row: any) => ({
    key: row.key,
    value: row.value,
    updatedAt: null,
  }));
}

export async function upsertStoreValue(key: string, value: unknown): Promise<boolean> {
  // Las escrituras pasan por el servidor, que comprueba la sesión del panel.
  // Escribir desde el navegador con el token público permitía cambiar el
  // contenido del sitio a cualquiera que copiara ese token del código.
  try {
    const res = await adminFetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });

    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: string })?.error || '';
      } catch {
        /* respuesta sin cuerpo */
      }
      console.error('upsertStoreValue: no se pudo guardar', key, res.status, detail);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Supabase upsertStoreValue error:', (e as Error).message);
    return false;
  }
}

type SupabaseStoreChangePayload = {
  new?: { key?: string; value?: unknown; updated_at?: string | null };
  old?: { key?: string; value?: unknown; updated_at?: string | null };
};

export function subscribeStoreChanges(onChange: (key: string, value: unknown, updatedAt?: string | null) => void): () => void {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (e) {
    console.warn('subscribeStoreChanges: Supabase not configured:', (e as Error).message);
    return () => {};
  }

  const channel = (supabase as any)
    .channel('pjl_store_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: STORE_TABLE },
      (payload: SupabaseStoreChangePayload) => {
        const key = payload.new?.key ?? payload.old?.key;
        const value = payload.new?.value ?? payload.old?.value;
        const updatedAt = payload.new?.updated_at ?? payload.old?.updated_at ?? null;
        if (key) onChange(key, value, updatedAt);
      }
    );

  (channel as any).subscribe();

  return () => {
    try { supabase.removeChannel(channel); } catch (e) { /* ignore */ }
  };
}
