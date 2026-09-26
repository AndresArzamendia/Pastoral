import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdminWriter } from '@/lib/requireAdmin';

export const dynamic = 'force-dynamic';

/**
 * Estadísticas de uso de la web, guardadas en Cloudflare D1.
 *
 * Antes: cada visita leía y reescribía la lista completa de dispositivos dentro
 * de la base de datos de Supabase (3 peticiones por visita, y crecía sin límite).
 *
 * Ahora: una fila por día y sección. El contador se incrementa con una escritura
 * mínima y el historial queda guardado en Cloudflare, no en la base de datos.
 */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
const MAX_RECENT = 60;

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

const today = () => new Date().toISOString().slice(0, 10);
const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Quita caracteres raros y deja un texto corto y limpio. */
function clean(value: unknown, max = 80): string {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) || 0;
    if (code < 0x20 || code === 0x7f) continue;
    if (out.length >= max) break;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export async function POST(request: NextRequest) {
  const db = await getDb();
  if (!db) return NextResponse.json({ ok: false, error: 'estadisticas-no-disponibles' }, { status: 503 });

  const rawBody = await request.text().catch(() => '');
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const section = clean(body.section, 60) || '/';
  const deviceId = clean(body.deviceId, 64) || 'anonimo';
  const browser = clean(body.browser, 24);
  const os = clean(body.os, 24);
  const deviceType = clean(body.deviceType, 16);
  const kind = body.kind === 'interaction' ? 'interaction' : 'visit';

  const country =
    clean((request as { cf?: { country?: string } }).cf?.country, 4) ||
    clean(request.headers.get('cf-ipcountry'), 4);

  const day = today();
  const now = new Date().toISOString();
  const column = kind === 'interaction' ? 'interactions' : 'views';

  try {
    // Contador del día y la sección (una sola fila, se suma en el sitio).
    const deviceColumn = deviceType === 'desktop' ? 'desktop' : deviceType === 'tablet' ? 'tablet' : 'mobile';
    await db
      .prepare(
        'INSERT INTO daily_views (day, section, views, interactions, desktop, tablet, mobile) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(day, section) DO UPDATE SET ' + column + ' = ' + column + ' + 1' +
          (kind === 'visit' ? ', ' + deviceColumn + ' = ' + deviceColumn + ' + 1' : ''),
      )
      .bind(
        day,
        section,
        kind === 'visit' ? 1 : 0,
        kind === 'interaction' ? 1 : 0,
        kind === 'visit' && deviceType === 'desktop' ? 1 : 0,
        kind === 'visit' && deviceType === 'tablet' ? 1 : 0,
        kind === 'visit' && deviceType === 'mobile' ? 1 : 0,
      )
      .run();

    // Un registro por día y dispositivo: quién entró, desde dónde y a qué sección.
    // Las visitas solo suman la primera vez del día.
    await db
      .prepare(
        'INSERT INTO daily_devices (day, device_id, section, browser, os, device_type, country, visits, last_seen) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) ' +
          'ON CONFLICT(day, device_id) DO UPDATE SET section = excluded.section, last_seen = excluded.last_seen',
      )
      .bind(day, deviceId, section, browser, os, deviceType, country, now)
      .run();
  } catch (e) {
    console.error('track error:', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'no-se-pudo-guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, day });
}

export async function DELETE(request: NextRequest) {
  // Borrar las estadísticas es una operación del panel: exige sesión.
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  const db = await getDb();
  if (!db) return NextResponse.json({ ok: false, error: 'estadisticas-no-disponibles' }, { status: 503 });
  try {
    await db.prepare('DELETE FROM daily_views').run();
    await db.prepare('DELETE FROM daily_devices').run();
    return NextResponse.json({ ok: true, borradoPor: auth.session.email });
  } catch (e) {
    console.error('reset stats error:', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'no-se-pudo-borrar' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // La lista de visitantes solo se muestra en el panel: exige sesión.
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;

  const db = await getDb();
  if (!db) return NextResponse.json({ ok: false, error: 'estadisticas-no-disponibles' }, { status: 503 });

  const asked = Number(request.nextUrl.searchParams.get('days') || DEFAULT_DAYS);
  const days = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), MAX_DAYS) : DEFAULT_DAYS;
  const from = since(days);

  try {
    const daily = await db
      .prepare(
        'SELECT v.day AS day, SUM(v.views) AS views, SUM(v.interactions) AS interactions, ' +
          '(SELECT COUNT(*) FROM daily_devices d WHERE d.day = v.day) AS visitors ' +
          'FROM daily_views v WHERE v.day >= ? GROUP BY v.day ORDER BY v.day ASC',
      )
      .bind(from)
      .all();

    const bySection = await db
      .prepare(
        'SELECT section, SUM(views) AS views, SUM(interactions) AS interactions, ' +
          'SUM(desktop) AS desktopVisits, SUM(tablet) AS tabletVisits, SUM(mobile) AS mobileVisits ' +
          'FROM daily_views WHERE day >= ? GROUP BY section ORDER BY views DESC, section ASC',
      )
      .bind(from)
      .all();

    const byCountry = await db
      .prepare(
        'SELECT country, COUNT(*) AS visitors FROM daily_devices ' +
          'WHERE day >= ? AND country <> \'\' GROUP BY country ORDER BY visitors DESC LIMIT 10',
      )
      .bind(from)
      .all();

    const recent = await db
      .prepare(
        'SELECT day, device_id, section, browser, os, device_type, country, visits, last_seen ' +
          'FROM daily_devices WHERE day >= ? ORDER BY last_seen DESC LIMIT ?',
      )
      .bind(from, MAX_RECENT)
      .all();

    const rows = (r: { results?: unknown[] } | undefined): Record<string, unknown>[] => {
      const list = r ? r.results : undefined;
      return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
    };

    const dailyRows = rows(daily).map((r) => ({
      day: String(r.day),
      views: Number(r.views || 0),
      interactions: Number(r.interactions || 0),
      visitors: Number(r.visitors || 0),
    }));

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        today: today(),
        days: days,
        daily: dailyRows,
        bySection: rows(bySection).map((r) => ({
          section: String(r.section),
          views: Number(r.views || 0),
          interactions: Number(r.interactions || 0),
          desktopVisits: Number(r.desktopVisits || 0),
          tabletVisits: Number(r.tabletVisits || 0),
          mobileVisits: Number(r.mobileVisits || 0),
        })),
        byCountry: rows(byCountry).map((r) => ({ country: String(r.country), visitors: Number(r.visitors || 0) })),
        recent: rows(recent).map((r) => ({
          day: String(r.day),
          deviceId: String(r.device_id || '').slice(0, 8),
          section: String(r.section || ''),
          browser: String(r.browser || ''),
          os: String(r.os || ''),
          deviceType: String(r.device_type || ''),
          country: String(r.country || ''),
          visits: Number(r.visits || 0),
          lastSeen: String(r.last_seen || ''),
        })),
        totals: {
          views: dailyRows.reduce((a, r) => a + r.views, 0),
          interactions: dailyRows.reduce((a, r) => a + r.interactions, 0),
          visitors: dailyRows.reduce((a, r) => a + r.visitors, 0),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('stats error:', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'no-se-pudo-leer' }, { status: 500 });
  }
}
