import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { siteOrigin } from '@/lib/siteUrlServer';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ success: false, message: 'Las variables de entorno de Supabase no están configuradas correctamente.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const email = body?.email;
  const origin = siteOrigin(request.url);
  const redirectTo =
    typeof body?.redirectTo === 'string' && body.redirectTo.startsWith(origin)
      ? body.redirectTo
      : `${origin}/reset-password/recover`;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ success: false, message: 'Ingresa un correo electrónico válido.' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || undefined,
  });

  if (error) {
    return NextResponse.json({ success: false, message: error.message || 'Error al enviar el correo de recuperación.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Correo de recuperación enviado. Revisa tu bandeja de entrada.' });
}
