/**
 * API Route: POST /api/news/articles/[id]/actions
 * Acciones rápidas: pin, unpin, publish, archive
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

export async function POST(request: NextRequest, context: RouteContext) {
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
    const { action, ...payload } = await request.json();

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { success: false, error: 'action is required' },
        { status: 400 }
      );
    }

    let updateData: Record<string, unknown> = {};

    switch (action) {
      case 'pin': {
        if (typeof payload.pin_order !== 'number' || payload.pin_order < 0 || payload.pin_order > 999) {
          updateData = { pinned: true, pin_order: 0 };
        } else {
          updateData = { pinned: true, pin_order: payload.pin_order };
        }
        break;
      }

      case 'unpin': {
        updateData = { pinned: false, pin_order: 999 };
        break;
      }

      case 'publish': {
        updateData = {
          published: true,
          published_at: new Date().toISOString(),
        };
        break;
      }

      case 'unpublish': {
        updateData = { published: false };
        break;
      }

      case 'archive': {
        updateData = {
          archived: true,
          archived_at: new Date().toISOString(),
        };
        break;
      }

      case 'unarchive': {
        updateData = {
          archived: false,
          archived_at: null,
        };
        break;
      }

      case 'feature': {
        updateData = { featured_on_homepage: true };
        break;
      }

      case 'unfeature': {
        updateData = { featured_on_homepage: false };
        break;
      }

      default: {
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
      }
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

    return NextResponse.json({
      success: true,
      message: `Action '${action}' completed successfully`,
      data: data[0],
    });
  } catch (error) {
    console.error('Error performing article action:', error);
    return NextResponse.json(
      { success: false, error: 'Error performing action' },
      { status: 500 }
    );
  }
}
