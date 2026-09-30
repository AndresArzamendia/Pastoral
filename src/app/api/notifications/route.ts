/**
 * API Route: Centro de Avisos
 *
 * GET  /api/notifications  → lista los avisos + cuáles ya leyó esa persona.
 * POST /api/notifications  → marca avisos como leídos (uno o todos).
 *
 * Solo entran al centro de avisos las noticias publicadas y los próximos
 * eventos de la agenda: lo que el equipo sube a propósito. Antes esta ruta
 * también armaba avisos por cada cambio del store (actividades, documentos,
 * cumpleaños y el journal de "se actualizó X"), y con solo abrir el panel se
 * marcaba todo como leído, así que los avisos perdían sentido.
 *
 * El estado "leído" vive en Cloudflare D1 (tabla notification_reads), no en el
 * navegador: por eso el mismo estado aparece en todos los dispositivos de la
 * misma persona.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';

export const dynamic = 'force-dynamic';

const supabaseConfig = getSupabaseRouteConfig();
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

export interface NotifItem {
  id: string;
  type: string;
  icon: string;
  title: string;
  body: string;
  time: string;
  href: string;
  urgent: boolean;
  tone: string;
  /** El aviso ya fue leído por esta persona (en este u otro dispositivo). */
  read: boolean;
  readAt: string | null;
}

const VISITOR_HEADER = 'x-pjl-visitor';
const MAX_VISITOR_LENGTH = 96;
const MAX_ARTICLES = 8;
const MAX_EVENTS = 12;
const MAX_ITEMS = 40;
const EVENT_WINDOW_DAYS = 30;
/** Por persona como máximo se guardan los 500 avisos leídos más recientes. */
const MAX_READS_PER_VISITOR = 500;
/** D1 admite 100 parámetros por consulta: 30 filas × 3 columnas = 90. */
const MAX_IDS_PER_STATEMENT = 30;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number) => String(n).padStart(2, '0');

function fmtDateShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysUntil(ymd: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function isoAt(endDate: string, startTime?: string | null): string {
  const [y, m, d] = endDate.split('-').map(Number);
  const hms = (startTime || '09:00').split(':');
  const t = new Date(y, (m || 1) - 1, d || 1, Number(hms[0]) || 9, Number(hms[1]) || 0, 0);
  return t.toISOString();
}

function toneFromHex(hex?: string | null): string {
  if (!hex) return 'gold';
  const h = (hex || '').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  if (r > 180 && g < 140 && b < 140) return 'red';
  if (g > 150 && r < 130) return 'green';
  if (b > 150 && r < 130) return 'blue';
  if (r > 150 && g > 100 && b < 110) return 'gold';
  if (r > 130 && b > 150) return 'purple';
  return 'gold';
}

function baseItem(item: Omit<NotifItem, 'read' | 'readAt'>): NotifItem {
  return { ...item, read: false, readAt: null };
}

/** Noticias y actividades que se publican desde el panel (tabla pjl_store). */
async function fetchStore(keys: string[]): Promise<Record<string, unknown>> {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.from('pjl_store').select('key, value').in('key', keys);
    if (error || !Array.isArray(data)) return {};
    return (data as Array<{ key: string; value: unknown }>).reduce((acc: Record<string, unknown>, row) => {
      if (row?.key) acc[row.key] = row.value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

/* ── D1 (lecturas) ─────────────────────────────────────────────────────────── */

type D1Statement = {
  run: () => Promise<unknown>;
  all: () => Promise<{ results?: unknown[] }>;
};

type D1Database = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => D1Statement;
  } & D1Statement;
};

async function getDb(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as { STATS_DB?: D1Database })?.STATS_DB;
    return db && typeof db.prepare === 'function' ? db : null;
  } catch {
    return null;
  }
}

/**
 * Identidad del visitante. El navegador manda "u:<id de Supabase>" cuando hay
 * sesión abierta (mismo estado en todos los dispositivos) y "d:<uuid del equipo>"
 * cuando todavía no se identificó.
 */
function visitorKeyFrom(request: NextRequest): string {
  const raw = request.headers.get(VISITOR_HEADER) || '';
  const clean = raw.replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, MAX_VISITOR_LENGTH);
  return clean || 'anonimo';
}

function rowsOf(result: { results?: unknown } | undefined): Record<string, unknown>[] {
  const list = result?.results;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

async function fetchReadAt(db: D1Database, visitorKey: string, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const result = await db
      .prepare(`SELECT notification_id, read_at FROM notification_reads WHERE visitor_key = ? AND notification_id IN (${placeholders})`)
      .bind(visitorKey, ...ids)
      .all();
    rowsOf(result).forEach((row) => {
      const id = String(row.notification_id || '');
      const at = String(row.read_at || '');
      if (id && at) map.set(id, at);
    });
  } catch (e) {
    console.error('notifications: no se pudieron leer las lecturas', (e as Error).message);
  }
  return map;
}

async function saveReadAt(db: D1Database, visitorKey: string, ids: string[], readAt: string): Promise<number> {
  let saved = 0;
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_STATEMENT) {
    const chunk = ids.slice(i, i + MAX_IDS_PER_STATEMENT);
    const values = chunk.map(() => '(?, ?, ?)').join(', ');
    const params = chunk.flatMap((id) => [visitorKey, id, readAt]);
    try {
      await db
        .prepare(`INSERT OR IGNORE INTO notification_reads (visitor_key, notification_id, read_at) VALUES ${values}`)
        .bind(...params)
        .run();
      saved += chunk.length;
    } catch (e) {
      console.error('notifications: no se pudo guardar la lectura', (e as Error).message);
    }
  }
  // La tabla no crece sin límite: se conservan los avisos leídos más recientes.
  try {
    await db
      .prepare(
        'DELETE FROM notification_reads WHERE visitor_key = ? AND notification_id NOT IN (' +
          'SELECT notification_id FROM notification_reads WHERE visitor_key = ? ORDER BY read_at DESC LIMIT ?)',
      )
      .bind(visitorKey, visitorKey, MAX_READS_PER_VISITOR)
      .run();
  } catch { /* la limpieza no es crítica */ }
  return saved;
}

/* ── Avisos (solo noticias y eventos) ─────────────────────────────────────── */

async function buildNotifications(): Promise<Omit<NotifItem, 'read' | 'readAt'>[]> {
  const notifications: Omit<NotifItem, 'read' | 'readAt'>[] = [];
  if (!supabase) return notifications;

  const today = localYmd(new Date());
  let dbArticles = 0;
  let dbEvents = 0;

  try {
    // ── 1) Noticias publicadas (tabla news_articles) ────────────────────────
    const { data: arts, error: artErr } = await supabase
      .from('news_articles')
      .select(
        `id, title, subtitle, slug, featured_image_url, category_id,
         created_at, updated_at, published_at,
         news_categories!left (id, name, slug, icon_emoji, color_hex)`,
      )
      .eq('published', true)
      .eq('archived', false)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(MAX_ARTICLES);

    if (artErr) {
      console.error('notifications: news error', artErr.message);
    } else if (Array.isArray(arts)) {
      dbArticles = arts.length;
      arts.forEach((a: any) => {
        const t = a.published_at || a.created_at || a.updated_at;
        if (!t) return;
        notifications.push(
          baseItem({
            id: `noticia-${a.id}`,
            type: 'noticia',
            icon: a.news_categories?.[0]?.icon_emoji || '📰',
            title: a.title || 'Nueva noticia',
            body: a.subtitle || 'Nueva publicación en el sitio',
            time: t,
            href: '/?page=noticias',
            urgent: false,
            tone: toneFromHex(a.news_categories?.[0]?.color_hex),
          }),
        );
      });
    }

    // ── 2) Próximos eventos de la agenda (tabla news_events) ───────────────
    const future = localYmd(new Date(Date.now() + EVENT_WINDOW_DAYS * 86400000));
    const { data: events, error: evtErr } = await supabase
      .from('news_articles')
      .select(
        `id, title, subtitle, slug, featured_image_url,
         news_categories!left (id, name, slug, icon_emoji, color_hex),
         news_events!left (id, start_date, start_time, end_date, location_name, location_address)`,
      )
      .eq('published', true)
      .eq('archived', false)
      .gte('news_events.start_date', today)
      .lte('news_events.start_date', future)
      .order('start_date', { foreignTable: 'news_events', ascending: true })
      .limit(MAX_EVENTS);

    if (evtErr) {
      console.error('notifications: events error', evtErr.message);
    } else if (Array.isArray(events)) {
      events.filter((it: any) => it.news_events && it.news_events.length > 0).forEach((a: any) => {
        const ev = a.news_events[0];
        if (!ev?.start_date) return;
        const d = daysUntil(ev.start_date);
        if (d < 0 || d > EVENT_WINDOW_DAYS) return;
        const soon = d <= 2;
        dbEvents += 1;
        notifications.push(
          baseItem({
            id: `evento-${ev.id}`,
            type: 'evento',
            icon: soon ? (d === 0 ? '⏰' : d === 1 ? '🌅' : '🔥') : '📅',
            title: (d === 0 ? '¡Hoy! ' : d === 1 ? 'Mañana · ' : `En ${d} días · `) + a.title,
            body: [fmtDateShort(ev.start_date), ev.start_time || '', ev.location_name || 'Agenda pastoral']
              .filter(Boolean)
              .join(' · '),
            time: isoAt(ev.start_date, ev.start_time),
            href: '/?page=agenda',
            urgent: soon,
            tone: toneFromHex(a.news_categories?.[0]?.color_hex),
          }),
        );
      });
    }
  } catch (e) {
    console.error('notifications: db error', e);
  }

  // ── 3) Noticias y actividades publicadas desde el panel (pjl_store) ───────
  // Hoy el contenido del sitio vive en el store: la tabla news_articles está
  // vacía. Por eso, si no hay nada en la base, se usan las noticias y actividades
  // que se suben desde el panel (y no se duplican avisos).
  const store = await fetchStore(['news', 'activities']);

  const storeNews = (Array.isArray(store.news) ? store.news : []) as any[];
  if (dbArticles === 0) {
    storeNews
      .filter((n) => n && n.published !== false && n.title)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, MAX_ARTICLES)
      .forEach((n) => {
        notifications.push(
          baseItem({
            id: `noticia-store-${n.id}`,
            type: 'noticia',
            icon: '📰',
            title: String(n.title),
            body: String(n.body || 'Nueva publicación en el sitio').slice(0, 160),
            time: isoAt(String(n.date || today), '08:00'),
            href: '/?page=noticias',
            urgent: false,
            tone: 'gold',
          }),
        );
      });
  }

  const storeActivities = (Array.isArray(store.activities) ? store.activities : []) as any[];
  if (dbEvents === 0) {
    storeActivities
      .filter((a) => a && a.active !== false && a.title && a.date)
      .map((a) => ({ ...a, d: daysUntil(String(a.date)) }))
      .filter((a) => a.d >= 0 && a.d <= EVENT_WINDOW_DAYS)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_EVENTS)
      .forEach((a) => {
        const soon = (a.d as number) <= 2;
        notifications.push(
          baseItem({
            id: `evento-store-${a.id}`,
            type: 'evento',
            icon: soon ? ((a.d as number) === 0 ? '⏰' : '🌅') : '📅',
            title: (a.d === 0 ? '¡Hoy! ' : a.d === 1 ? 'Mañana · ' : `En ${a.d} días · `) + String(a.title),
            body: `${fmtDateShort(String(a.date))}${a.category ? ' · ' + a.category : ' · Agenda pastoral'}`,
            time: isoAt(String(a.date), '09:00'),
            href: '/?page=agenda',
            urgent: soon,
            tone: a.category === 'Liturgia' ? 'green' : a.category === 'Formación' ? 'purple' : 'blue',
          }),
        );
      });
  }

  return notifications
    .sort((a, b) => {
      const av = a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1;
      if (av !== 0) return av;
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime();
    })
    .slice(0, MAX_ITEMS);
}

/* ── Rutas ─────────────────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  if (!supabase) return missingSupabaseConfigResponse();

  const visitorKey = visitorKeyFrom(request);
  const base = await buildNotifications();
  const ids = base.map((n) => n.id);

  const db = await getDb();
  const readAt = db ? await fetchReadAt(db, visitorKey, ids) : new Map<string, string>();

  const notifications: NotifItem[] = base.map((n) => {
    const at = readAt.get(n.id) || null;
    return { ...n, read: Boolean(at), readAt: at };
  });

  return NextResponse.json(
    {
      success: true,
      notifications,
      unread: notifications.filter((n) => !n.read).length,
      persistent: Boolean(db),
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  if (!supabase) return missingSupabaseConfigResponse();

  const rawBody = await request.text().catch(() => '');
  let body: { ids?: unknown; all?: unknown } = {};
  try {
    body = JSON.parse(rawBody) as { ids?: unknown; all?: unknown };
  } catch {
    body = {};
  }

  const db = await getDb();
  if (!db) {
    return NextResponse.json({ success: false, error: 'lecturas-no-disponibles' }, { status: 503 });
  }

  // Solo se aceptan ids que existen ahora mismo en el centro de avisos: así no
  // se pueden guardar filas basura desde fuera.
  const valid = new Set((await buildNotifications()).map((n) => n.id));
  const asked = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : [];
  const ids = (body.all === true ? [...valid] : asked.filter((id) => valid.has(id))).slice(0, MAX_ITEMS);

  if (ids.length === 0) {
    return NextResponse.json({ success: true, marked: 0, readAt: new Date().toISOString() });
  }

  const readAt = new Date().toISOString();
  const marked = await saveReadAt(db, visitorKeyFrom(request), ids, readAt);

  return NextResponse.json({ success: true, marked, readAt });
}