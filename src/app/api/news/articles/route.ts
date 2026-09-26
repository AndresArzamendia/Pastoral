/**
 * API Route: POST/GET /api/news/articles
 * Crear y listar artículos de noticias
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSlug } from '@/lib/newsValidation';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { withEdgeCache } from '@/lib/edgeCache';
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

// Helper: Validar entrada
function validateArticleInput(body: unknown) {
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body is required'] };
  }

  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  if (!b.title || typeof b.title !== 'string' || b.title.length < 5 || b.title.length > 200) {
    errors.push('title: debe tener entre 5 y 200 caracteres');
  }

  if (b.subtitle && (typeof b.subtitle !== 'string' || b.subtitle.length > 300)) {
    errors.push('subtitle: no puede exceder 300 caracteres');
  }

  if (!b.body || typeof b.body !== 'string' || b.body.length < 20 || b.body.length > 10000) {
    errors.push('body: debe tener entre 20 y 10000 caracteres');
  }

  if (b.featured_image_url && typeof b.featured_image_url === 'string') {
    if (!isValidImageSource(b.featured_image_url)) {
      errors.push('featured_image_url: URL o imagen inválida');
    }
  }

  return { valid: errors.length === 0, errors };
}

// GET: Listar artículos con filtros
export async function GET(request: NextRequest) {
  return withEdgeCache(request, () => buildResponse(request));
}

async function buildResponse(request: NextRequest) {
  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const searchParams = request.nextUrl.searchParams;
    const category_id = searchParams.get('category_id');
    const published = searchParams.get('published')?.toLowerCase() === 'true' ? true : searchParams.get('published')?.toLowerCase() === 'false' ? false : undefined;
    const archived = searchParams.get('archived')?.toLowerCase() === 'true';
    const pinned = searchParams.get('pinned')?.toLowerCase() === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const sort_by = searchParams.get('sort_by') || 'published_at';
    const sort_order = (searchParams.get('sort_order') || 'desc').toLowerCase();

    let query = supabase
      .from('news_articles')
      .select(
        `
        id, title, subtitle, body, slug, featured_image_url, gallery_urls,
        published, pinned, pin_order, featured_on_homepage, views_count,
        created_at, updated_at, published_at, expires_at, archived,
        category_id, event_date, inscription_url, external_link, google_drive_url, event_location,
        news_categories!left (id, name, slug, icon_emoji, color_hex),
        news_events!left (id, start_date, start_time, end_date, end_time, location_name, location_lat, location_lng)
        `,
        { count: 'exact' }
      );

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (published !== undefined) {
      query = query.eq('published', published);
    }

    if (archived) {
      query = query.eq('archived', archived);
    }

    if (pinned) {
      query = query.eq('pinned', pinned);
    }

    if (sort_by === 'event_date') {
      query = query.order('start_date', { ascending: sort_order === 'asc', foreignTable: 'news_events' });
    } else {
      query = query.order(sort_by as any, { ascending: sort_order === 'asc' });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching articles' },
      { status: 500 }
    );
  }
}

// POST: Crear nuevo artículo
export async function POST(request: NextRequest) {
  // Crear noticias es una operación del panel: exige sesión iniciada.
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  // Cliente con el token del usuario, para que la base de datos aplique sus
  // propias reglas de permiso sobre quién puede escribir.
  const supabase = supabaseConfig
    ? createClient(supabaseConfig.url, supabaseConfig.key, {
        global: { headers: { Authorization: 'Bearer ' + auth.token } },
      })
    : null;

  try {
    if (!supabase) return missingSupabaseConfigResponse();

    const body = await request.json();
    const { valid, errors } = validateArticleInput(body);

    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    const title = (body.title as string).trim();
    const subtitle = (body.subtitle as string | undefined)?.trim() || '';
    const bodyText = (body.body as string).trim();
    const slug = body.slug ? (body.slug as string).toLowerCase() : generateSlug(title);

    const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [];

    const articleData = {
      title,
      subtitle,
      body: bodyText,
      slug,
      category_id: body.category_id || null,
      tags: JSON.stringify(tags),
      featured_image_url: body.featured_image_url || null,
      gallery_urls: JSON.stringify([]),
      published: body.published === true,
      pinned: false,
      pin_order: 999,
      featured_on_homepage: false,
      published_at: body.published === true ? new Date().toISOString() : null,
      expires_at: body.expires_at || null,
      // Nuevos campos
      event_date: body.event_date || null,
      inscription_url: body.inscription_url || null,
      external_link: body.external_link || null,
      google_drive_url: body.google_drive_url || null,
      event_location: body.event_location || null,
    };

    const { data, error } = await supabase
      .from('news_articles')
      .insert([articleData])
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
    console.error('Error creating article:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating article' },
      { status: 500 }
    );
  }
}
