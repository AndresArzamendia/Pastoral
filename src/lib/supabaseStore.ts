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

type StoreChangeListener = (key: string, value: unknown, updatedAt?: string | null) => void;

const STORE_CHANNEL_TOPIC = 'pjl_store_changes';
const storeListeners = new Set<StoreChangeListener>();
let storeChannelStarted = false;

/* Un solo canal de Realtime para todo el sitio, con muchos suscriptores locales.
   Antes cada llamada a subscribeStoreChanges() abría su propio canal con el mismo
   topic, y supabase-js 2.108 devuelve el canal ya existente en vez de crear uno
   nuevo: el segundo .on() tras el subscribe() lanzaba
   "cannot add postgres_changes callbacks ... after subscribe()" y tumbaba la
   página con el error global. */
function startStoreChannel() {
  if (storeChannelStarted) return;

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (e) {
    console.warn('subscribeStoreChanges: Supabase not configured:', (e as Error).message);
    return;
  }

  storeChannelStarted = true;

  const channel = (supabase as any)
    .channel(STORE_CHANNEL_TOPIC)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: STORE_TABLE },
      (payload: SupabaseStoreChangePayload) => {
        const key = payload.new?.key ?? payload.old?.key;
        if (!key) return;
        const value = payload.new?.value ?? payload.old?.value;
        const updatedAt = payload.new?.updated_at ?? payload.old?.updated_at ?? null;
        for (const listener of Array.from(storeListeners)) {
          try { listener(key, value, updatedAt); } catch (e) { console.error('Error en un suscriptor de pjl_store:', e); }
        }
      }
    );

  (channel as any).subscribe();
}

export function subscribeStoreChanges(onChange: StoreChangeListener): () => void {
  storeListeners.add(onChange);
  startStoreChannel();
  return () => {
    storeListeners.delete(onChange);
  };
}
