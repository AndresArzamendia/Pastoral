/**
 * API Route: GET/PATCH/DELETE /api/news/events/[id]
 * Gestionar un evento específico
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { requireAdminWriter } from '@/lib/requireAdmin';

const supabaseConfig = getSupabaseRouteConfig();
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: Obtener un evento específico
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const { id } = await context.params;

    const { data, error } = await supabase
      .from('news_events')
      .select(
        `
        *,
        news_articles!left (id, title, slug, featured_image_url, subtitle, published)
        `
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching event:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching event' },
      { status: 500 }
    );
  }
}

// PATCH: Actualizar un evento
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    if (!supabase) return missingSupabaseConfigResponse();

    const { id } = await context.params;
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.start_date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
        return NextResponse.json(
          { success: false, error: 'start_date must be in YYYY-MM-DD format' },
          { status: 400 }
        );
      }
      updateData.start_date = body.start_date;
    }

    if (body.start_time !== undefined) {
      if (body.start_time !== null && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(body.start_time)) {
        return NextResponse.json(
          { success: false, error: 'start_time must be in HH:MM format' },
          { status: 400 }
        );
      }
      updateData.start_time = body.start_time;
    }

    if (body.end_date !== undefined) {
      if (body.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
        return NextResponse.json(
          { success: false, error: 'end_date must be in YYYY-MM-DD format' },
          { status: 400 }
        );
      }
      updateData.end_date = body.end_date;
    }

    if (body.end_time !== undefined) {
      if (body.end_time !== null && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(body.end_time)) {
        return NextResponse.json(
          { success: false, error: 'end_time must be in HH:MM format' },
          { status: 400 }
        );
      }
      updateData.end_time = body.end_time;
    }

    if (body.location_name !== undefined) {
      updateData.location_name = body.location_name;
    }

    if (body.location_address !== undefined) {
      updateData.location_address = body.location_address;
    }

    if (body.google_maps_url !== undefined) {
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
      updateData.google_maps_url = body.google_maps_url;
    }

    if (body.location_lat !== undefined) {
      if (body.location_lat !== null && (body.location_lat < -90 || body.location_lat > 90)) {
        return NextResponse.json(
          { success: false, error: 'location_lat must be between -90 and 90' },
          { status: 400 }
        );
      }
      updateData.location_lat = body.location_lat;
    }

    if (body.location_lng !== undefined) {
      if (body.location_lng !== null && (body.location_lng < -180 || body.location_lng > 180)) {
        return NextResponse.json(
          { success: false, error: 'location_lng must be between -180 and 180' },
          { status: 400 }
        );
      }
      updateData.location_lng = body.location_lng;
    }

    if (body.allow_inscription !== undefined) {
      updateData.allow_inscription = Boolean(body.allow_inscription);
    }

    if (body.max_participants !== undefined) {
      if (body.max_participants !== null && (typeof body.max_participants !== 'number' || body.max_participants < 1)) {
        return NextResponse.json(
          { success: false, error: 'max_participants must be a positive number' },
          { status: 400 }
        );
      }
      updateData.max_participants = body.max_participants;
    }

    if (body.inscription_deadline !== undefined) {
      updateData.inscription_deadline = body.inscription_deadline;
    }

    if (body.contact_person_name !== undefined) {
      updateData.contact_person_name = body.contact_person_name;
    }

    if (body.contact_email !== undefined) {
      if (body.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email)) {
        return NextResponse.json(
          { success: false, error: 'contact_email must be a valid email' },
          { status: 400 }
        );
      }
      updateData.contact_email = body.contact_email;
    }

    if (body.contact_phone !== undefined) {
      updateData.contact_phone = body.contact_phone;
    }

    const { data, error } = await supabase
      .from('news_events')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating event' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar un evento
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const { id } = await context.params;

    const { error } = await supabase
      .from('news_events')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Evento eliminado correctamente',
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      { success: false, error: 'Error deleting event' },
      { status: 500 }
    );
  }
}
