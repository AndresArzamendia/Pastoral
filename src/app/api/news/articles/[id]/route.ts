/**
 * API Route: GET/PATCH/DELETE /api/news/articles/[id]
 * Obtener, actualizar y eliminar artículos individuales
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { requireAdminWriter } from '@/lib/requireAdmin';

const supabaseConfig = getSupabaseRouteConfig();
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

function isValidImageSource(value: string) {
  if (value.startsWith('data:image/')) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: Obtener un artículo específico
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const { id } = await context.params;

    const { data, error } = await supabase
      .from('news_articles')
      .select(
        `
        id, title, subtitle, body, slug, featured_image_url, gallery_urls,
        published, pinned, pin_order, featured_on_homepage, views_count,
        created_at, updated_at, published_at, expires_at, archived,
        category_id, event_date, inscription_url, external_link, google_drive_url, event_location,
        news_categories!left (id, name, slug, icon_emoji, color_hex),
        news_events!left (id, start_date, start_time, end_date, end_time, location_name, location_address, google_maps_url, location_lat, location_lng, allow_inscription, max_participants, current_participants, inscription_deadline, contact_person_name, contact_email, contact_phone)
        `
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Artículo no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching article:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching article' },
      { status: 500 }
    );
  }
}

// PATCH: Actualizar un artículo
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

    // Validar datos de entrada
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.length < 5 || body.title.length > 200) {
        return NextResponse.json(
          { success: false, error: 'title: debe tener entre 5 y 200 caracteres' },
          { status: 400 }
        );
      }
      updateData.title = body.title.trim();
    }

    if (body.subtitle !== undefined) {
      if (body.subtitle === null) {
        updateData.subtitle = null;
      } else if (typeof body.subtitle !== 'string' || body.subtitle.length > 300) {
        return NextResponse.json(
          { success: false, error: 'subtitle: no puede exceder 300 caracteres' },
          { status: 400 }
        );
      } else {
        updateData.subtitle = body.subtitle.trim();
      }
    }

    if (body.body !== undefined) {
      if (typeof body.body !== 'string' || body.body.length < 20 || body.body.length > 10000) {
        return NextResponse.json(
          { success: false, error: 'body: debe tener entre 20 y 10000 caracteres' },
          { status: 400 }
        );
      }
      updateData.body = body.body.trim();
    }

    if (body.slug !== undefined) {
      const slug = (body.slug as string).toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return NextResponse.json(
          { success: false, error: 'slug: debe contener solo letras, números y guiones' },
          { status: 400 }
        );
      }
      updateData.slug = slug;
    }

    if (body.category_id !== undefined) {
      updateData.category_id = body.category_id;
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) {
        return NextResponse.json(
          { success: false, error: 'tags: debe ser un array' },
          { status: 400 }
        );
      }
      updateData.tags = JSON.stringify(body.tags);
    }

    if (body.featured_image_url !== undefined) {
      if (body.featured_image_url && !isValidImageSource(body.featured_image_url)) {
        return NextResponse.json(
          { success: false, error: 'featured_image_url: URL o imagen inválida' },
          { status: 400 }
        );
      }
      updateData.featured_image_url = body.featured_image_url || null;
    }

    if (body.featured_on_homepage !== undefined) {
      updateData.featured_on_homepage = Boolean(body.featured_on_homepage);
    }

    if (body.published !== undefined) {
      const willPublish = Boolean(body.published);
      updateData.published = willPublish;
      if (willPublish && !body.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    }

    if (body.published_at !== undefined) {
      updateData.published_at = body.published_at;
    }

    if (body.expires_at !== undefined) {
      updateData.expires_at = body.expires_at;
    }

    if (body.archived !== undefined) {
      updateData.archived = Boolean(body.archived);
      if (body.archived) {
        updateData.archived_at = new Date().toISOString();
      }
    }

    if (body.pinned !== undefined) {
      updateData.pinned = Boolean(body.pinned);
    }

    if (body.pin_order !== undefined && typeof body.pin_order === 'number') {
      updateData.pin_order = body.pin_order;
    }

    // Nuevos campos
    if (body.event_date !== undefined) {
      updateData.event_date = body.event_date || null;
    }
    if (body.inscription_url !== undefined) {
      updateData.inscription_url = body.inscription_url || null;
    }
    if (body.external_link !== undefined) {
      updateData.external_link = body.external_link || null;
    }
    if (body.google_drive_url !== undefined) {
      updateData.google_drive_url = body.google_drive_url || null;
    }
    if (body.event_location !== undefined) {
      updateData.event_location = body.event_location || null;
    }

    const { data, error } = await supabase
      .from('news_articles')
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
        { success: false, error: 'Artículo no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error updating article:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating article' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar un artículo
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const { id } = await context.params;

    const { error } = await supabase
      .from('news_articles')
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
      message: 'Artículo eliminado correctamente',
    });
  } catch (error) {
    console.error('Error deleting article:', error);
    return NextResponse.json(
      { success: false, error: 'Error deleting article' },
      { status: 500 }
    );
  }
}
