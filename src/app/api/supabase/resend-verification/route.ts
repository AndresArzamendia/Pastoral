import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { siteOrigin } from '@/lib/siteUrlServer';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({
      success: false,
      message: 'Las variables de entorno de Supabase no están configuradas correctamente.',
    }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const email = body?.email;
  const origin = siteOrigin(request.url);
  const redirectTo =
    typeof body?.redirectTo === 'string' && body.redirectTo.startsWith(origin)
      ? body.redirectTo
      : `${origin}/confirmation?success=true`;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ success: false, message: 'Falta el correo electrónico.' }, { status: 400 });
  }

  if (!serviceRoleKey) {
    return NextResponse.json({
      success: false,
      message: 'No hay credenciales de servicio configuradas. Contacta al administrador.',
    }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.auth.admin.generateLink({
    type: 'signup',
    email,
    password: Math.random().toString(36).slice(-12),
    options: {
      redirectTo: redirectTo || undefined,
    },
  });

  if (error) {
    console.error('Supabase resend verification error:', error.message);
    return NextResponse.json({
      success: false,
      message: error.message || 'Error al reenviar el correo de verificación.',
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Correo de verificación reenviado. El usuario recibirá un nuevo enlace de confirmación.',
  });
}
