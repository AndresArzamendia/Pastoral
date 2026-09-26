import { NextRequest, NextResponse } from 'next/server';
import { setAdminToken } from '@/lib/pushServer';
import { requireAdminWriter } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Guardar el token que se usa para enviar avisos a los celulares.
 *
 * Antes bastaba con mandar un texto con el formato "correo|rol" para que la ruta
 * aceptara el token: cualquiera podía hacerse pasar por administrador y después
 * enviar avisos a nombre del sitio. Ahora hace falta iniciar sesión.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = body?.token;
  if (!token || typeof token !== 'string' || token.length < 8) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }

  const ok = await setAdminToken(token);
  if (!ok) {
    return NextResponse.json({ success: false, error: 'No se pudo guardar el token' }, { status: 500 });
  }
  return NextResponse.json({ success: true, guardadoPor: auth.session.email });
}
