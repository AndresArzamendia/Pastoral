/**
 * API Route: GET /api/device/info
 * Expone la IP pública del visitante (desde los headers de Cloudflare/Proxy).
 * El resto de la información del dispositivo (nombre, tipo, red, horarios)
 * se recoge del lado del cliente y se guarda en el store pjl_store → clave 'devices'.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    '';

  return NextResponse.json({ ip });
}