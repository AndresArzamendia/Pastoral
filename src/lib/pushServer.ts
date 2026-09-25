import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getSupabaseRouteConfig } from '@/lib/supabaseRoute';

const STORE_TABLE = 'pjl_store';
const VAPID_KEY = 'push_vapid';
const SUBS_KEY = 'push_subscriptions';
const ADMIN_TOKEN_KEY = 'push_admin_token';

export { VAPID_KEY, SUBS_KEY, ADMIN_TOKEN_KEY };

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt?: string;
}

async function getSupabase() {
  const cfg = getSupabaseRouteConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.key);
}

export async function getVapidConfig(): Promise<VapidConfig | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(STORE_TABLE)
    .select('value')
    .eq('key', VAPID_KEY)
    .maybeSingle();
  if (error || !data?.value) return null;
  const v = data.value as Partial<VapidConfig>;
  if (!v.publicKey || !v.privateKey || !v.subject) return null;
  return { publicKey: v.publicKey, privateKey: v.privateKey, subject: v.subject };
}

export async function saveVapidConfig(config: VapidConfig): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from(STORE_TABLE)
    .upsert({ key: VAPID_KEY, value: config }, { onConflict: 'key' });
  return !error;
}

export async function getSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(STORE_TABLE)
    .select('value')
    .eq('key', SUBS_KEY)
    .maybeSingle();
  if (error || !data?.value) return [];
  const arr = data.value as PushSubscriptionRecord[];
  return Array.isArray(arr) ? arr : [];
}

export async function getAdminToken(): Promise<string | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(STORE_TABLE)
    .select('value')
    .eq('key', ADMIN_TOKEN_KEY)
    .maybeSingle();
  if (error || !data?.value) return null;
  const v = data.value as { token?: string };
  return v?.token ?? null;
}

export async function setAdminToken(token: string): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from(STORE_TABLE)
    .upsert({ key: ADMIN_TOKEN_KEY, value: { token } }, { onConflict: 'key' });
  return !error;
}

export async function generateAdminToken(): Promise<string> {
  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2);
  await setAdminToken(token);
  return token;
}

export async function isAdminRequest(authorization: string | null): Promise<boolean> {
  if (!authorization) return false;
  const stored = await getAdminToken();
  if (!stored) return false;
  return authorization === `Bearer ${stored}`;
}

export async function upsertSubscription(sub: PushSubscriptionRecord): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;
  const current = await getSubscriptions();
  const next = current.filter((s) => s.endpoint !== sub.endpoint);
  next.push(sub);
  const { error } = await supabase
    .from(STORE_TABLE)
    .upsert({ key: SUBS_KEY, value: next }, { onConflict: 'key' });
  return !error;
}

export async function removeSubscription(endpoint: string): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;
  const current = await getSubscriptions();
  const next = current.filter((s) => s.endpoint !== endpoint);
  const { error } = await supabase
    .from(STORE_TABLE)
    .upsert({ key: SUBS_KEY, value: next }, { onConflict: 'key' });
  return !error;
}

async function sendOne(config: VapidConfig, sub: PushSubscriptionRecord, payload: string) {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      payload,
      {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
        TTL: 86400,
      }
    );
    return { ok: true, endpoint: sub.endpoint };
  } catch (err: any) {
    // 404/410 => suscripción inválida/borrada: quitarla.
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await removeSubscription(sub.endpoint);
      return { ok: false, gone: true, endpoint: sub.endpoint };
    }
    return { ok: false, error: String(err?.message || err), endpoint: sub.endpoint };
  }
}

export async function sendPushToAll(
  title: string,
  body: string,
  url: string,
  image = '',
  icon = ''
): Promise<{ sent: number; failed: number; removed: number }> {
  const config = await getVapidConfig();
  const subs = await getSubscriptions();
  if (!config || subs.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }
  const payload = JSON.stringify({ title, body, url, ...(image ? { image } : {}), ...(icon ? { icon } : {}) });
  let sent = 0;
  let failed = 0;
  let removed = 0;
  // web-push puede saturarse con muchos envíos; límite de concurrencia simple.
  const CONCURRENCY = 10;
  const results = await mapLimit(subs, CONCURRENCY, (sub) => sendOne(config, sub, payload));
  for (const r of results) {
    if (r.ok) sent++;
    else if (r.gone) {
      removed++;
    } else {
      failed++;
    }
  }
  return { sent, failed, removed };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
