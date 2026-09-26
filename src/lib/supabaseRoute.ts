import { NextResponse } from 'next/server';

export interface SupabaseRouteConfig {
  url: string;
  key: string;
}

export const getSupabaseRouteConfig = (): SupabaseRouteConfig | null => {
  // El Worker define SUPABASE_URL / SUPABASE_ANON_KEY; en local pueden existir
  // los nombres con prefijo NEXT_PUBLIC_. Se aceptan ambos.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
};

export const missingSupabaseConfigResponse = () =>
  NextResponse.json(
    {
      success: false,
      error: 'Missing Supabase configuration',
    },
    { status: 503 }
  );
