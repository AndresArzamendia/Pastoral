const SECRET_KEYS = new Set(['aiKey', 'googleCalendarClientSecret', 'googleCalendarClientId', 'push_vapid', 'push_subscriptions', 'push_admin_token', 'serviceRoleKey', 'apiKey']);

export function sanitizeContentForClient<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeContentForClient(v)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k)) {
      continue; // drop secrets
    }
    out[k] = sanitizeContentForClient(v);
  }
  return out as T;
}

export function sanitizeUsersForClient<T>(value: T): T {
  if (!Array.isArray(value)) return value;
  return (value as any[]).map((u) => {
    if (!u || typeof u !== 'object') return u;
    const out = { ...u };
    delete out.password;
    delete out.pass;
    delete out.secret;
    delete out.token;
    delete out.apiKey;
    return out;
  }) as T;
}
