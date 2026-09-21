/**
 * API Route: GET /api/notifications
 * Centro de Avisos: agrega TODO lo que se publica o cambia en el sitio.
 * Fuentes: noticias (DB), próximos eventos (DB + store), novedades/actividades,
 * documentos nuevos, cumpleaños de los miembros y el journal de actualizaciones.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig, missingSupabaseConfigResponse } from '@/lib/supabaseRoute';
import { TEAM_LABELS } from '@/lib/pjlStore';

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
}

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

function isoAtDaysFromNow(days: number, hour = 9): string {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0);
  return t.toISOString();
}

function isoAt(endDate: string, startTime?: string | null): string {
  const [y, m, d] = endDate.split('-').map(Number);
  const hms = (startTime || '09:00').split(':');
  const t = new Date(y, (m || 1) - 1, d || 1, Number(hms[0]) || 9, Number(hms[1]) || 0, 0);
  return t.toISOString();
}

function toneFromHex(hex?: string | null): string {
  if (!hex) return 'red';
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

// Claves del store cuyo "se actualizó" genérico vale la pena avisar.
const META_TYPES: Record<string, { type: string; icon: string; title: string; tone: string; href: string; team?: string }> = {
  content:  { type: 'contenido', icon: '✨', title: 'Se actualizó el contenido del sitio', tone: 'gold', href: '/?page=institucional' },
  profiles: { type: 'miembro',   icon: '👥', title: 'Se actualizaron los perfiles del consejo', tone: 'purple', href: '/?page=consejo' },
  chapels:  { type: 'capilla',   icon: '⛪', title: 'Se actualizaron las comunidades', tone: 'green', href: '/?page=zonas' },
  gallery:  { type: 'galeria',   icon: '🖼️', title: 'Nuevas imágenes en la galería', tone: 'pink', href: '/?page=home' },
  hero:     { type: 'galeria',   icon: '🎠', title: 'Se renovó el carrusel principal', tone: 'pink', href: '/?page=home' },
  social:   { type: 'social',    icon: '🌐', title: 'Se actualizaron nuestras redes sociales', tone: 'blue', href: '/?page=contacto' },
  sections: { type: 'contenido', icon: '🧩', title: 'Se ajustaron las secciones del sitio', tone: 'gold', href: '/?page=home' },
  faq:      { type: 'faq',       icon: '💬', title: 'Se actualizaron las preguntas frecuentes', tone: 'blue', href: '/?page=preguntas' },
  branding: { type: 'contenido', icon: '🎨', title: 'Se renovó la identidad visual', tone: 'gold', href: '/?page=home' },
};

export async function GET() {
  if (!supabase) return missingSupabaseConfigResponse();

  const notifications: NotifItem[] = [];
  const today = localYmd(new Date());
  let articles: any[] | null = null;

  try {
    // ── 1) NOTICIAS publicadas (DB) ────────────────────────────────
    const { data: arts, error: artErr } = await supabase
      .from('news_articles')
      .select(
        `id, title, subtitle, slug, featured_image_url, category_id,
         created_at, updated_at, published_at,
         news_categories!left (id, name, slug, icon_emoji, color_hex)`
      )
      .eq('published', true)
      .eq('archived', false)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(8);

    if (artErr) {
      console.error('notifications: news error', artErr.message);
    } else if (Array.isArray(arts)) {
      articles = arts;
      arts.forEach((a: any, i: number) => {
        const t = a.published_at || a.created_at || a.updated_at;
        if (!t) return;
        notifications.push({
          id: `noticia-${a.id}`,
          type: 'noticia',
          icon: a.news_categories?.[0]?.icon_emoji || '📰',
          title: a.title || 'Nueva noticia',
          body: a.subtitle || `Nueva publicación${['', '', ' en el sitio'][i] || ' en el sitio'}`,
          time: t,
          href: '/?page=noticias',
          urgent: false,
          tone: toneFromHex(a.news_categories?.[0]?.color_hex),
        });
      });
    }

    // ── 2) PRÓXIMOS EVENTOS (DB news_events, próximos 30 días) ─────
    const future30 = localYmd(new Date(Date.now() + 30 * 86400000));
    const { data: events, error: evtErr } = await supabase
      .from('news_articles')
      .select(
        `id, title, subtitle, slug, featured_image_url,
         news_categories!left (id, name, slug, icon_emoji, color_hex),
         news_events!left (id, start_date, start_time, end_date, location_name, location_address)`
      )
      .eq('published', true)
      .eq('archived', false)
      .gte('news_events.start_date', today)
      .lte('news_events.start_date', future30)
      .order('start_date', { foreignTable: 'news_events', ascending: true })
      .limit(12);

    if (evtErr) {
      console.error('notifications: events error', evtErr.message);
    } else if (Array.isArray(events)) {
      events.filter((it: any) => it.news_events && it.news_events.length > 0).forEach((a: any) => {
        const ev = a.news_events[0];
        if (!ev?.start_date) return;
        const d = daysUntil(ev.start_date);
        if (d < 0 || d > 30) return;
        const soon = d <= 2;
        notifications.push({
          id: `evento-${ev.id}`,
          type: 'evento',
          icon: soon ? (d === 0 ? '⏰' : d === 1 ? '🌅' : '🔥') : '📅',
          title: (d === 0 ? '¡Hoy!' : d === 1 ? 'Mañana' : `En ${d} días`) + ' · ' + a.title,
          body: [fmtDateShort(ev.start_date), ev.start_time || '', ev.location_name || 'Agenda pastoral']
            .filter(Boolean).join(' · '),
          time: isoAt(ev.start_date, ev.start_time),
          href: '/?page=agenda',
          urgent: soon,
          tone: toneFromHex(a.news_categories?.[0]?.color_hex) || 'green',
        });
      });
    }
  } catch (e) {
    console.error('notifications: db error', e);
  }

  // ── 3) DATOS DEL STORE (pjl_store) ──────────────────────────────
  let storeRows: Record<string, any> = {};
  try {
    const { data: storeData, error: storeErr } = await supabase
      .from('pjl_store')
      .select('key, value')
      .in('key', ['news', 'activities', 'docs', 'profiles', 'meta_updated', 'content', 'chapels']);

    if (!storeErr && Array.isArray(storeData)) {
      storeRows = (storeData || []).reduce((acc: Record<string, any>, row: any) => {
        if (row?.key) acc[row.key] = row.value;
        return acc;
      }, {});
    }
  } catch { /* store no disponible */ }

  // Novedades del store (solo si la DB no trajo noticias, para no duplicar)
  if ((!articles || articles.length === 0) && Array.isArray(storeRows.news)) {
    (storeRows.news as any[])
      .filter((n: any) => n && n.published)
      .filter((n: any) => n.date && daysUntil(n.date) > -45)
      .forEach((n: any) => {
        notifications.push({
          id: `novedad-${n.id}`,
          type: 'novedad',
          icon: '⚡',
          title: n.title || 'Nueva novedad',
          body: `Publicado el ${fmtDateShort(n.date)}`,
          time: isoAt(n.date),
          href: '/?page=noticias',
          urgent: false,
          tone: 'gold',
        });
      });
  }

  // Actividades del store (próximas y activas) — la agenda las muestra
  const dbEventTitles = new Set(
    notifications.filter((n) => n.type === 'evento').map((n) => n.title)
  );
  if (Array.isArray(storeRows.activities)) {
    (storeRows.activities as any[])
      .filter((a: any) => a && a.active && a.date)
      .map((a: any) => ({ ...a, d: daysUntil(a.date) }))
      .filter((a: any) => a.d >= 0 && a.d <= 30)
      .forEach((a: any) => {
        const title = `📌 ${a.title}`;
        if (dbEventTitles.has(title)) return;
        dbEventTitles.add(title);
        notifications.push({
          id: `actividad-${a.id}`,
          type: 'actividad',
          icon: a.category === 'Liturgia' ? '🕯️' : a.category === 'Formación' ? '🎓' : '📌',
          title: a.title,
          body: `${fmtDateShort(a.date)}${a.category ? ' · ' + a.category : ' · Actividad'}`,
          time: isoAt(a.date),
          href: '/?page=agenda',
          urgent: (a.d as number) <= 2,
          tone: a.category === 'Liturgia' ? 'green' : a.category === 'Formación' ? 'purple' : 'blue',
        });
      });
  }

  // Documentos nuevos (subidos hace menos de 90 días)
  if (Array.isArray(storeRows.docs)) {
    (storeRows.docs as any[])
      .filter((d: any) => d && d.uploadedAt && daysUntil(d.uploadedAt) > -90)
      .sort((a: any, b: any) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')))
      .slice(0, 6)
      .forEach((d: any) => {
        notifications.push({
          id: `doc-${d.id}`,
          type: 'documento',
          icon: '📄',
          title: d.name || 'Nuevo documento',
          body: `${d.type || 'Archivo'}${d.size ? ' · ' + d.size : ''} · ${fmtDateShort(d.uploadedAt)}`,
          time: isoAt(d.uploadedAt),
          href: '/?page=documentos',
          urgent: false,
          tone: 'blue',
        });
      });
  }

  // Cumpleaños próximos (7 días) — miembro/coordinador
  if (Array.isArray(storeRows.profiles)) {
    (storeRows.profiles as any[])
      .filter((p: any) => p && p.birthday && /^\d{4}-\d{2}-\d{2}$/.test(String(p.birthday)))
      .forEach((p: any) => {
        const b = String(p.birthday);
        const [, m, dd] = b.split('-').map(Number);
        const now = new Date();
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let next = new Date(now.getFullYear(), (m || 1) - 1, dd || 1);
        if (next.getTime() < todayMid.getTime()) next = new Date(now.getFullYear() + 1, (m || 1) - 1, dd || 1);
        const diff = Math.round((next.getTime() - todayMid.getTime()) / 86400000);
        if (diff < 0 || diff > 7) return;
        const team = p.teamKey && TEAM_LABELS[p.teamKey] ? TEAM_LABELS[p.teamKey] : 'Familia PJL';
        notifications.push({
          id: `cumple-${p.id}`,
          type: 'cumpleaños',
          icon: '🎂',
          title: `Cumpleaños de ${p.name || 'un miembro'}${diff === 0 ? ' ¡HOY!' : ''}`,
          body: diff === 0
            ? `¡Feliz cumpleaños! · ${team}`
            : `${fmtDateShort(localYmd(next))} · ${team} · En ${diff} día${diff === 1 ? '' : 's'}`,
          time: isoAtDaysFromNow(diff),
          href: '/?page=consejo',
          urgent: diff === 0,
          tone: 'pink',
        });
      });
  }

  // Journal de actualizaciones del store (últimos 7 días)
  try {
    const meta = storeRows['meta_updated'] as Record<string, string> | undefined;
    const nowTs = Date.now();
    if (meta && typeof meta === 'object') {
      Object.entries(meta).forEach(([key, ts]) => {
        const cfg = META_TYPES[key];
        if (!cfg || !ts) return;
        const t = new Date(ts as string).getTime();
        if (!t || nowTs - t > 7 * 86400000) return;
        notifications.push({
          id: `upd-${key}`,
          type: cfg.type,
          icon: cfg.icon,
          title: cfg.title,
          body: cfg.team ? `${cfg.team} · Revisá qué cambió` : 'Revisá qué cambió en esta sección',
          time: ts as string,
          href: cfg.href,
          urgent: false,
          tone: cfg.tone,
        });
      });
    }
  } catch { /* journal inválido */ }

  // ── Ordenar y limitar ────────────────────────────────────────────
  const sorted = notifications
    .sort((a, b) => {
      const av = a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1;
      if (av !== 0) return av;
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime();
    })
    .slice(0, 40);

  return NextResponse.json({
    success: true,
    notifications: sorted,
    generatedAt: new Date().toISOString(),
  });
}