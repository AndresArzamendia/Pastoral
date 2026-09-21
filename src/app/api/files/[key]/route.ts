import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

async function serveFile(request: NextRequest, ctx: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!key || key.length > 300) return new NextResponse(null, { status: 400 });

  let bucket: any;
  try {
    const { env } = await getCloudflareContext({ async: true });
    bucket = (env as any)?.UPLOADS_BUCKET;
  } catch { /* fuera de Cloudflare */ }
  if (!bucket || typeof bucket.get !== 'function') return new NextResponse(null, { status: 404 });

  let obj: any;
  try {
    obj = await bucket.get(key);
  } catch { /* bucket inaccesible */ }
  if (!obj) return new NextResponse(null, { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.nextUrl.searchParams.get('dl') === '1' && obj.customMetadata?.name && typeof obj.customMetadata.name === 'string') {
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(obj.customMetadata.name)}"`;
  }

  return new NextResponse(obj.body as ReadableStream<Uint8Array>, { headers });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  return serveFile(request, ctx);
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  return serveFile(request, ctx);
}