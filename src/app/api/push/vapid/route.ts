import { NextResponse } from 'next/server';
import webpush from 'web-push';
import {
  getVapidConfig,
  saveVapidConfig,
  isAdminRequest,
  clearSubscriptions,
} from '@/lib/pushServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Al cambiar el par de claves VAPID, las suscripciones viejas quedan ligadas
// al publicKey anterior y ya nunca podrán recibir avisos. Se vacían para que
// el contador de dispositivos refleje la realidad.
async function invalidateSubsIfKeyChanged(newConfig: { publicKey: string }) {
  const old = await getVapidConfig();
  if (old?.publicKey && newConfig.publicKey && old.publicKey !== newConfig.publicKey) {
    await clearSubscriptions();
    return true;
  }
  return false;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!(await isAdminRequest(auth))) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  const config = await getVapidConfig();
  return NextResponse.json({
    success: true,
    configured: !!config,
    config: config
      ? { publicKey: config.publicKey, subject: config.subject }
      : null,
  });
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (!(await isAdminRequest(auth))) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === 'generate') {
    const keys = webpush.generateVAPIDKeys();
    const subject = body?.subject || 'mailto:pastoral@luque.edu.py';
    const ok = await saveVapidConfig({ ...keys, subject });
    if (!ok) {
      return NextResponse.json({ success: false, error: 'No se pudo guardar en Supabase' }, { status: 500 });
    }
    const subsReset = await invalidateSubsIfKeyChanged(keys);
    return NextResponse.json({ success: true, publicKey: keys.publicKey, subsReset });
  }

  // Guardar claves pegadas manualmente.
  const publicKey = body?.publicKey?.trim();
  const privateKey = body?.privateKey?.trim();
  const subject = body?.subject?.trim() || 'mailto:pastoral@luque.edu.py';
  if (!publicKey || !privateKey) {
    return NextResponse.json({ success: false, error: 'Faltan claves' }, { status: 400 });
  }
  const ok = await saveVapidConfig({ publicKey, privateKey, subject });
  if (!ok) {
    return NextResponse.json({ success: false, error: 'No se pudo guardar en Supabase' }, { status: 500 });
  }
  const subsReset = await invalidateSubsIfKeyChanged({ publicKey });
  return NextResponse.json({ success: true, publicKey, subsReset });
}
