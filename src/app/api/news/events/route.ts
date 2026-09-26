/**
 * API Route: POST/GET /api/news/events
 * Gestionar eventos asociados a artículos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { withEdgeCache } from '@/lib/edgeCache';
import { requireAdminWriter } from '@/lib/requireAdmin';

const supabaseConfig = getSupabaseRouteConfig();
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

// GET: Listar próximos eventos
export async function GET(request: NextRequest) {
  return withEdgeCache(request, () => buildResponse(request));
}

async function buildResponse(request: NextRequest) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const daysAhead = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '30'), 365);
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data, error } = await supabase
      .from('news_events')
      .select(
        `
        id,
        article_id,
        start_date,
        start_time,
        end_date,
        end_time,
        location_name,
        location_address,
        google_maps_url,
        location_lat,
        location_lng,
        allow_inscription,
        max_participants,
        current_participants,
        news_articles!left (id, title, slug, featured_image_url, subtitle)
        `
      )
      .gte('start_date', today)
      .lte('start_date', futureDate)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching events' },
      { status: 500 }
    );
  }
}

// POST: Crear nuevo evento
export async function POST(request: NextRequest) {
  // Operacion del panel: exige sesion iniciada.
  // Cliente con el token del usuario, para que la base de datos aplique sus
  const auth = await requireAdminWriter(request);
  // propias reglas de permiso sobre quién puede escribir.
  if (!auth.ok) return auth.response;
  const supabase = supabaseConfig

    ? createClient(supabaseConfig.url, supabaseConfig.key, {
        global: { headers: { Authorization: 'Bearer ' + auth.token } },
      })
    : null;

  try {
    // Verificación de Supabase para corregir error de TypeScript en Vercel
    if (!supabase) return missingSupabaseConfigResponse();

    const body = await request.json();

    // Validaciones
    if (!body.article_id || typeof body.article_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'article_id is required and must be a valid UUID' },
        { status: 400 }
      );
    }

    if (!body.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
      return NextResponse.json(
        { success: false, error: 'start_date is required and must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    if (body.start_time && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(body.start_time)) {
      return NextResponse.json(
        { success: false, error: 'start_time must be in HH:MM format (24h)' },
        { status: 400 }
      );
    }

    if (body.google_maps_url) {
      try {
        const url = new URL(body.google_maps_url);
        if (!url.hostname.includes('google.com') && !url.hostname.includes('maps.google.com')) {
          return NextResponse.json(
            { success: false, error: 'google_maps_url must be a valid Google Maps URL' },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: 'google_maps_url must be a valid URL' },
          { status: 400 }
        );
      }
    }

    const eventData = {
      article_id: body.article_id,
      start_date: body.start_date,
      start_time: body.start_time || null,
      end_date: body.end_date || null,
      end_time: body.end_time || null,
      location_name: body.location_name || null,
      location_address: body.location_address || null,
      google_maps_url: body.google_maps_url || null,
      location_lat: body.location_lat || null,
      location_lng: body.location_lng || null,
      allow_inscription: body.allow_inscription === true,
      max_participants: body.max_participants || null,
      current_participants: 0,
      inscription_deadline: body.inscription_deadline || null,
      contact_person_name: body.contact_person_name || null,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
    };

    const { data, error } = await supabase
      .from('news_events')
      .insert([eventData])
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, data: data?.[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating event' },
      { status: 500 }
    );
  }
}