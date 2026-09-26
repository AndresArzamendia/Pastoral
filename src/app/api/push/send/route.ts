import { NextResponse } from 'next/server';
import {
  sendPushToAll,
  getSubscriptions,
  getVapidConfig,
} from '@/lib/pushServer';
import { requireAdminWriter } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enviar avisos a los celulares que·suscribieron.
 *
 * Se exige sesión del panel. Antes se aceptaba un token que el mismo panel podía
 * cambiar, así que cualquiera que se hiciera pasar por administrador podía enviar
 * avisos con el nombre del sitio.
 */
export async function GET(request: Request) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  const subs = await getSubscriptions();
  return NextResponse.json({ success: true, count: subs.length, subscriptions: subs });
}

export async function POST(request: Request) {
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const title = body?.title?.trim();
  const content = body?.body?.trim();
  const url = body?.url?.trim() || '/';
  const image = body?.image?.trim() || '';
  const icon = body?.icon?.trim() || '';
  if (!title || !content) {
    return NextResponse.json({ success: false, error: 'Faltan título o mensaje' }, { status: 400 });
  }
  if (!(await getVapidConfig())) {
    return NextResponse.json(
      { success: false, error: 'Web Push no configurado. Generá las claves VAPID primero.' },
      { status: 503 }
    );
  }
  const subs = await getSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Todavía no hay suscriptores. Pedí permiso de notificación en algún celular primero.' },
      { status: 400 }
    );
  }
  const result = await sendPushToAll(title, content, url, image, icon);
  return NextResponse.json({ success: true, ...result });
}
