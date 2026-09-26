import { NextRequest, NextResponse } from 'next/server';
import { getFileStorage } from '@/lib/uploadStorage';
import { r2PublicUrl } from '@/lib/r2';
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

  const storage = await getFileStorage();
  if (!storage) {
    return NextResponse.json({ ok: false, error: 'r2-no-disponible' }, { status: 503 });
  }

  const ext = EXT_BY_MIME[file.type] || (file.name.includes('.') ? (file.name.split('.').pop() || 'bin').toLowerCase() : 'bin');
  const key = `${Date.now()}-${randomToken()}.${ext}`;

  // El archivo se manda como File, no leído a memoria: el runtime lo transmite
  // por streaming tanto contra el binding como contra la API S3.
  const body: BodyInit = file;

  try {
    await storage.put(key, body, { contentType: file.type || 'application/octet-stream', name: file.name, size: file.size });
  } catch (error) {
    console.error(`[upload] falló la subida con ${storage.driver}:`, error);
    return NextResponse.json({ ok: false, error: 'upload-fallido' }, { status: 500 });
  }

  /* Se guarda la URL pública del bucket cuando se puede, para que la imagen se
     sirva desde el edge de Cloudflare sin gastar invocaciones del servidor y
     funcione igual en Vercel que en Cloudflare. Si el bucket es privado y no hay
     URL pública, se guarda la ruta del sitio: /api/files la resuelve por el
     binding o por la API S3, y al menos la imagen se ve. */
  const url = r2PublicUrl(key) || `/api/files/${key}`;
  return NextResponse.json({ ok: true, url, key, driver: storage.driver });
}