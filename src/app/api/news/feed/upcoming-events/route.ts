/**
 * API Route: GET /api/news/feed/upcoming-events
 * Obtener próximos eventos ordenados por fecha
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { withEdgeCache } from '@/lib/edgeCache';

const supabaseConfig = getSupabaseRouteConfig();
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

export async function GET(request: NextRequest) {
  return withEdgeCache(request, () => buildResponse(request));
}

async function buildResponse(request: NextRequest) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const days = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '30'), 365);
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '10'), 50);

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data, error } = await supabase
      .from('news_articles')
      .select(
        `
        id, title, subtitle, slug, featured_image_url,
        category_id,
        news_categories!left (id, name, slug, icon_emoji, color_hex),
        news_events!left (
          id, start_date, start_time, end_date, end_time,
          location_name, location_address, google_maps_url,
          location_lat, location_lng, allow_inscription, max_participants, current_participants
        )
        `
      )
      .eq('published', true)
      .eq('archived', false)
      .gte('news_events.start_date', today)
      .lte('news_events.start_date', futureDate)
      .order('start_date', { foreignTable: 'news_events', ascending: true })
      .order('start_time', { foreignTable: 'news_events', ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    // Filtrar solo artículos que tienen eventos
    const eventsData = data?.filter((item: any) => item.news_events && item.news_events.length > 0) || [];

    return NextResponse.json({
      success: true,
      data: eventsData,
    });
  } catch (error) {
    console.error('Error fetching upcoming events:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching events' },
      { status: 500 }
    );
  }
}
