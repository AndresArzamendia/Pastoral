/**
 * API Route: GET /api/news/feed/homepage
 * Obtener artículos para mostrar en la página principal (pinned + recientes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { withEdgeCache } from '@/lib/edgeCache';

const supabaseConfig = getSupabaseRouteConfig();
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

/* Se cachea 5 min en el Worker: es la ruta que más egress de base gastaba
   (35 KB por visita). El contenido devuelto es idéntico. */
export async function GET(request: NextRequest) {
  return withEdgeCache(request, () => buildResponse(request));
}

async function buildResponse(request: NextRequest) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '10'), 50);

    // 1. Obtener artículos pinned
    const { data: pinnedData, error: pinnedError } = await supabase
      .from('news_articles')
      .select(
        `
        id, title, subtitle, body, slug, featured_image_url, gallery_urls,
        published, pinned, pin_order, featured_on_homepage, views_count,
        created_at, updated_at, published_at, expires_at,
        category_id, event_date, inscription_url, external_link, google_drive_url, event_location,
        news_categories!left (id, name, slug, icon_emoji, color_hex),
        news_events!left (id, start_date, start_time, end_date, location_name, location_lat, location_lng)
        `
      )
      .eq('published', true)
      .eq('archived', false)
      .eq('pinned', true)
      .order('pin_order', { ascending: true })
      .limit(Math.ceil(limit * 0.3)); // 30% del límite son pinned

    // 2. Obtener artículos recientes
    const { data: recentData, error: recentError } = await supabase
      .from('news_articles')
      .select(
        `
        id, title, subtitle, body, slug, featured_image_url, gallery_urls,
        published, pinned, pin_order, featured_on_homepage, views_count,
        created_at, updated_at, published_at, expires_at,
        category_id, event_date, inscription_url, external_link, google_drive_url, event_location,
        news_categories!left (id, name, slug, icon_emoji, color_hex),
        news_events!left (id, start_date, start_time, end_date, location_name, location_lat, location_lng)
        `
      )
      .eq('published', true)
      .eq('archived', false)
      .eq('pinned', false)
      .order('published_at', { ascending: false })
      .limit(Math.ceil(limit * 0.7)); // 70% del límite son recientes

    if (pinnedError || recentError) {
      return NextResponse.json(
        { success: false, error: 'Error fetching feed' },
        { status: 400 }
      );
    }

    // Combinar: pinned primero, luego recientes
    const combinedData = [...(pinnedData || []), ...(recentData || [])].slice(0, limit);

    return NextResponse.json({
      success: true,
      data: combinedData,
    });
  } catch (error) {
    console.error('Error fetching homepage feed:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching feed' },
      { status: 500 }
    );
  }
}
