/**
 * API Route: GET /api/news/search
 * Búsqueda full-text y filtrado avanzado
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

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const category_id = searchParams.get('category_id');
    const from_date = searchParams.get('from_date');
    const to_date = searchParams.get('to_date');
    const is_event = searchParams.get('is_event')?.toLowerCase() === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    let sqlQuery = supabase
      .from('news_articles')
      .select(
        `
        id, title, subtitle, body, slug, featured_image_url, gallery_urls,
        published, pinned, pin_order, featured_on_homepage, views_count,
        created_at, updated_at, published_at, expires_at, archived,
        category_id,
        news_categories!left (id, name, slug, icon_emoji, color_hex),
        news_events!left (id, start_date, start_time, end_date, end_time, location_name, location_lat, location_lng)
        `,
        { count: 'exact' }
      );

    // Solo mostrar artículos publicados
    sqlQuery = sqlQuery.eq('published', true).eq('archived', false);

    // Búsqueda full-text
    if (query && query.trim()) {
      const searchTerm = query.trim();
      sqlQuery = sqlQuery.or(
        `title.ilike.%${searchTerm}%,subtitle.ilike.%${searchTerm}%,body.ilike.%${searchTerm}%`
      );
    }

    if (category_id) {
      sqlQuery = sqlQuery.eq('category_id', category_id);
    }

    if (from_date) {
      sqlQuery = sqlQuery.gte('published_at', `${from_date}T00:00:00`);
    }

    if (to_date) {
      sqlQuery = sqlQuery.lte('published_at', `${to_date}T23:59:59`);
    }

    if (is_event) {
      // Filtrar solo artículos que tienen eventos asociados
      sqlQuery = sqlQuery.not('news_events', 'is', null);
    }

    sqlQuery = sqlQuery
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await sqlQuery;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error searching articles:', error);
    return NextResponse.json(
      { success: false, error: 'Error searching articles' },
      { status: 500 }
    );
  }
}
