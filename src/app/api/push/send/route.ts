import { NextResponse } from 'next/server';
import {
  sendPushToAll,
  getSubscriptions,
  isAdminRequest,
  getVapidConfig,
} from '@/lib/pushServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!(await isAdminRequest(auth))) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  const subs = await getSubscriptions();
  return NextResponse.json({ success: true, count: subs.length, subscriptions: subs });
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (!(await isAdminRequest(auth))) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const title = body?.title?.trim();
  const content = body?.body?.trim();
  const url = body?.url?.trim() || '/';
  const image = body?.image?.trim() || '';
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
  const result = await sendPushToAll(title, content, url, image);
  return NextResponse.json({ success: true, ...result });
}
