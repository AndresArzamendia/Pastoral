import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdminWriter } from '@/lib/requireAdmin';

export const dynamic = 'force-dynamic';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

const MAX_UPLOAD = 50 * 1024 * 1024;

function randomToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export async function POST(request: NextRequest) {
  // Solo quien inició sesión en el panel puede subir archivos. Antes esta ruta
  // era pública: cualquiera podía guardar hasta 50 MB en el bucket y generar
  // costo, o dejar archivos servidos desde el dominio del sitio.
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  let file: File | null = null;
  try {
    const form = await request.formData();
    file = (form.get('file') as File) || null;
  } catch { /* body inválido */ }

  if (!file || !file.size) {
    return NextResponse.json({ ok: false, error: 'archivo vacío' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    return NextResponse.json({ ok: false, error: 'archivo demasiado grande' }, { status: 413 });
  }

  let bucket: any;
  try {
    const { env } = await getCloudflareContext({ async: true });
    bucket = (env as any)?.UPLOADS_BUCKET;
  } catch { /* fuera de Cloudflare (dev) */ }
  if (!bucket || typeof bucket.put !== 'function') {
    return NextResponse.json({ ok: false, error: 'r2-no-disponible' }, { status: 503 });
  }

  const ext = EXT_BY_MIME[file.type] || (file.name.includes('.') ? (file.name.split('.').pop() || 'bin').toLowerCase() : 'bin');
  const key = `${Date.now()}-${randomToken()}.${ext}`;
  try {
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { name: file.name, size: String(file.size) },
    });
    return NextResponse.json({ ok: true, url: `/api/files/${key}`, key });
  } catch {
    return NextResponse.json({ ok: false, error: 'upload-fallido' }, { status: 500 });
  }
}