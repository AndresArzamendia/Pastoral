import { getSupabaseClient } from './supabase';

/**
 * Envío de peticiones del panel con el token de sesión.
 *
 * El token lo entrega Supabase al iniciar sesión. Se manda en cada operación que
 * modifica el sitio, y el servidor lo comprueba contra Supabase. Si no hay
 * sesión, la petición sale sin token y el servidor la rechaza.
 */

const TOKEN_WARNING = 'adminFetch: no hay sesión de Supabase activa.';

export async function getAdminAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) {
      console.warn('getAdminAccessToken:', error.message);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (e) {
    console.warn(TOKEN_WARNING, (e as Error).message);
    return null;
  }
}

/** ¿Hay una sesión real de Supabase en este navegador? */
export async function hasAdminSession(): Promise<boolean> {
  return (await getAdminAccessToken()) !== null;
}

/**
 * Igual que fetch(), pero con el token de sesión del panel.
 * En el resto de las opciones se comporta igual que un fetch normal.
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAdminAccessToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** Cierra la sesión de Supabase (se usa al salir del panel). */
export async function signOutAdmin(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut();
  } catch (e) {
    console.warn('signOutAdmin:', (e as Error).message);
  }
}
