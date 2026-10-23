const hits = new Map<string, { count: number; resetAt: number }>();

function getKey(request: Request): string {
  const headers = request.headers;
  const ip =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'anon';
  const ua = headers.get('user-agent') || '';
  return `${ip}|${ua.slice(0, 64)}`;
}

export function checkRateLimit(
  request: Request,
  opts: { windowMs: number; max: number } = { windowMs: 60_000, max: 10 }
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const key = getKey(request);
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (entry.count >= opts.max) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfter };
  }
  entry.count += 1;
  return { ok: true };
}

export function rateLimitResponse(retryAfter: number) {
  return new Response(
    JSON.stringify({ success: false, message: 'Demasiadas solicitudes. Intentá de nuevo más tarde.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  );
}
