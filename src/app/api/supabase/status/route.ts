import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    // Try a lightweight query to ensure the DB is reachable
    const { error } = await supabase.from('pjl_store').select('key').limit(1);
    if (error) {
      // Do not leak raw DB error messages
      return NextResponse.json({ ok: false, message: 'Servicio no disponible' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, message: 'Supabase reachable' });
  } catch {
    return NextResponse.json({ ok: false, message: 'Servicio no disponible' }, { status: 503 });
  }
}
