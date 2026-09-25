import { NextResponse } from 'next/server';
import { setAdminToken } from '@/lib/pushServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// El panel manda el "secret" como base64(email|rol). Lo decodificamos antes de validar.
function decodeSecret(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.includes('|')) return decoded;
    } catch {}
  }
  return raw;
}

// Guard provisorio: el panel manda un "secret" derivado del usuario logueado
// (email|rol, o usuario|rol en el login de prueba). No es infalible, pero
// evita que cualquiera envíe avisos.
function acceptableSecret(secret?: string): boolean {
  const s = decodeSecret(secret);
  if (!s) return false;
  return /(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[A-Za-z0-9_.-]+)\|(superadmin|desarrollador|admin|editor)/i.test(s);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token || typeof token !== 'string' || !acceptableSecret(body?.secret)) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  const ok = await setAdminToken(token);
  if (!ok) {
    return NextResponse.json({ success: false, error: 'No se pudo guardar el token' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
