/**
 * API Route: POST/GET /api/news/categories
 * Gestionar categorías de noticias
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSlug } from '@/lib/newsValidation';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { withEdgeCache } from '@/lib/edgeCache';

// GET: Listar todas las categorías
export async function GET(request: NextRequest) {
  return withEdgeCache(request, () => buildResponse(request));
}

async function buildResponse(request: NextRequest) {
  try {
    const config = getSupabaseRouteConfig();
    if (!config) return missingSupabaseConfigResponse();
    const supabase = createClient(config.url, config.key);

    const includeInactive = request.nextUrl.searchParams.get('include_inactive') === 'true';

    let query = supabase.from('news_categories').select('*');

    if (!includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query.order('sort_order', { ascending: true });

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
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { success: false, error: 'Error fetching categories' },
      { status: 500 }
    );
  }
}

// POST: Crear nueva categoría
export async function POST(request: NextRequest) {
  try {
    const config = getSupabaseRouteConfig();
    if (!config) return missingSupabaseConfigResponse();
    const supabase = createClient(config.url, config.key);

    const body = await request.json();

    if (!body.name || typeof body.name !== 'string' || body.name.length < 3 || body.name.length > 100) {
      return NextResponse.json(
        { success: false, error: 'name: debe tener entre 3 y 100 caracteres' },
        { status: 400 }
      );
    }

    if (body.color_hex && !/^#[0-9A-F]{6}$/i.test(body.color_hex)) {
      return NextResponse.json(
        { success: false, error: 'color_hex: debe ser un color hexadecimal válido' },
        { status: 400 }
      );
    }

    const slug = body.slug ? (body.slug as string).toLowerCase() : generateSlug(body.name);

    const categoryData = {
      name: (body.name as string).trim(),
      slug,
      description: body.description || null,
      icon_emoji: body.icon_emoji || null,
      color_hex: body.color_hex || '#C8973A',
      sort_order: body.sort_order ?? 0,
      active: body.active !== false,
    };

    const { data, error } = await supabase
      .from('news_categories')
      .insert([categoryData])
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
    console.error('Error creating category:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating category' },
      { status: 500 }
    );
  }
}
