'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNotifications } from '../lib/useNotifications';
import { getSupabaseClient } from '../lib/supabase';
import type { NotifItem } from '@/app/api/notifications/route';

/**
 * Centro de Avisos.
 *
 * Solo muestra noticias y próximos eventos (lo que el equipo sube), y cada
 * aviso se marca como leído al entrar a la noticia, no al abrir el panel.
 *
 * El estado "leído" se guarda en el servidor (Cloudflare D1) con una clave por
 * persona: "u:<id de Supabase>" si hay sesión abierta —mismo estado en todos sus
 * dispositivos— o "d:<uuid del equipo>" si todavía no se identificó. El
 * localStorage es solo una copia de respaldo para que el panel abra al instante
 * si el servidor no está disponible.
 */

const VISITOR_KEY = 'pjl_notif_visitor';
const LOCAL_READS_KEY = 'pjl_notif_reads';
const MAX_LOCAL_READS = 300;
const POLL_MS = 60000;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function relLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const diff = now - t;
  if (diff > -5 * 60000 && diff < 0) return 'pronto';
  if (diff < 0) {
    const d = new Date(t);
    const y = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
  }
  if (diff < 60000) return 'recién';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const d0 = new Date(now);
    const d1 = new Date(t);
    const sameDay = d0.getFullYear() === d1.getFullYear() && d0.getMonth() === d1.getMonth() && d0.getDate() === d1.getDate();
    if (sameDay) return `hace ${h} h`;
  }
  const days = Math.floor(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  const d = new Date(t);
  const y = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* sin soporte */ }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Identidad estable de este equipo/navegador (respaldo si no hay sesión). */
function deviceVisitorId(): string {
  try {
    const prev = localStorage.getItem(VISITOR_KEY);
    if (prev) return prev;
    const next = uuid();
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return 'anonimo';
  }
}

/** Si hay sesión de Supabase, la identidad es la cuenta: se repite en cada dispositivo. */
async function resolveVisitorKey(): Promise<string> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const id = data.session?.user?.id;
    if (id) return `u:${id}`;
  } catch { /* sin sesión: se usa el equipo */ }
  return `d:${deviceVisitorId()}`;
}

function loadLocalReads(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_READS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveLocalReads(map: Record<string, string>) {
  try {
    const keys = Object.keys(map);
    if (keys.length > MAX_LOCAL_READS) {
      keys
        .sort((a, b) => new Date(map[b]).getTime() - new Date(map[a]).getTime())
        .slice(MAX_LOCAL_READS)
        .forEach((k) => delete map[k]);
    }
    localStorage.setItem(LOCAL_READS_KEY, JSON.stringify(map));
  } catch { /* sin acceso */ }
}

export default function NotificationBell() {
  const { supported, permission, subscribed, isSubscribing, backendReady, subscribe, unsubscribe, refreshState } = useNotifications();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const visitor = useRef<string>('');
  const localReads = useRef<Record<string, string>>({});
  const storeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/notifications', {
        cache: 'no-store',
        headers: visitor.current ? { 'x-pjl-visitor': visitor.current } : undefined,
      });
      const json = await res.json();
      if (json?.success && Array.isArray(json.notifications)) {
        const list = json.notifications as NotifItem[];
        // El respaldo local nunca contradice al servidor: si el servidor todavía
        // no conoce la lectura, esta se conserva hasta que se sincronice.
        list.forEach((n) => {
          if (!n.read && localReads.current[n.id]) {
            n.read = true;
            n.readAt = localReads.current[n.id];
          }
        });
        setItems(list);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    localReads.current = loadLocalReads();

    let cancelled = false;
    void resolveVisitorKey().then((key) => {
      if (cancelled) return;
      visitor.current = key;
      void load();
    });

    const interval = setInterval(() => load(true), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const onFocus = () => load(true);
    const visibility = () => { if (!document.hidden) load(true); };
    const onStore = () => {
      if (storeTimer.current) clearTimeout(storeTimer.current);
      storeTimer.current = setTimeout(() => load(true), 900);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };

    window.addEventListener('focus', onFocus);
    window.addEventListener('pjl_store_update', onStore);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(tick);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pjl_store_update', onStore);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', onKey);
      if (storeTimer.current) clearTimeout(storeTimer.current);
    };
  }, [load]);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  const unreadItems = useMemo(() => items.filter((n) => !n.read), [items]);
  const readItems = useMemo(() => items.filter((n) => n.read), [items]);

  /** Guarda la lectura en el navegador y en el servidor. */
  const persistRead = useCallback(async (ids: string[], all = false) => {
    if (ids.length === 0) return;
    const stamp = new Date().toISOString();
    const map = { ...localReads.current };
    ids.forEach((id) => { map[id] = stamp; });
    localReads.current = map;
    saveLocalReads(map);
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true, readAt: n.readAt || stamp } : n)),
    );
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(visitor.current ? { 'x-pjl-visitor': visitor.current } : {}),
        },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });
    } catch {
      /* sin conexión: queda guardado en el navegador y se sube al volver a abrir */
    }
  }, []);

  const openItem = useCallback(
    (item: NotifItem) => {
      if (!item.read) void persistRead([item.id]);
      setOpen(false);
      const page = new URLSearchParams(item.href.split('?')[1] || '').get('page') || 'home';
      window.dispatchEvent(new CustomEvent('pjl_navigate', { detail: { id: page } }));
    },
    [persistRead],
  );

  const markAllRead = useCallback(() => {
    void persistRead(unreadItems.map((n) => n.id), true);
    setShowRead(false);
}, [persistRead, unreadItems]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const go = useCallback((page: string) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('pjl_navigate', { detail: { id: page } }));
  }, []);

  const handlePush = async () => {
    setPushMsg(null);
    const r = await subscribe();
    if (!r.ok) setPushMsg(r.reason || 'No se pudo activar. Revisá los permisos del navegador.');
  };

  const handlePushOff = async () => {
    setPushMsg(null);
    const ok = await unsubscribe();
    if (!ok) setPushMsg('No se pudo desactivar. Intentá de nuevo.');
  };

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <>
      <button
        type="button"
        className={`notif-bell ${unread > 0 ? 'has-unread' : ''} ${open ? 'is-open' : ''}`}
        onClick={toggle}
        aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="notif-bell-ico" aria-hidden="true">🔔</span>
        <span className="notif-label">Avisos</span>
        {unread > 0 && (
          <span className="notif-badge" aria-hidden="true">{badge}</span>
        )}
        {unread > 0 && <span className="notif-dot" aria-hidden="true"></span>}
      </button>

      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} aria-hidden="true"></div>
          <div className="notif-panel" role="dialog" aria-label="Centro de avisos de la Pastoral">
            <div className="notif-panel-head">
              <span className="notif-panel-title">🔔 Centro de Avisos</span>
              {unread > 0 ? (
                <>
                  <span className="notif-unread-chip">{unread} sin leer</span>
                  <button type="button" className="notif-clear-btn" onClick={markAllRead} title="Marcar todo como leído">
                    ✓ Marcar todo leído
                  </button>
                </>
              ) : (
                <span className="notif-read-chip">Todo leído</span>
              )}
              <button type="button" className="notif-close-btn" onClick={() => setOpen(false)} aria-label="Cerrar avisos">
                ✕
              </button>
            </div>

            {supported && backendReady && (
              <div className="notif-push-row">
                {subscribed ? (
                  <>
                    <span className="notif-push-ok">📣 Avisos push activados</span>
                    <button type="button" className="notif-push-btn notif-push-off" onClick={handlePushOff} disabled={isSubscribing}>
                      {isSubscribing ? 'Desactivando…' : '🔕 Desactivar'}
                    </button>
                  </>
                ) : permission !== 'denied' ? (
                  <button type="button" className="notif-push-btn" onClick={handlePush} disabled={isSubscribing}>
                    🔕 Activar avisos push
                  </button>
                ) : (
                  <>
                    <small className="notif-push-err">Permiso bloqueado. Desbloqueá este sitio desde el candado 🔒 de la barra de direcciones (Notificaciones → Permitir) y luego tocá Reintentar.</small>
                    <button type="button" className="notif-push-btn notif-push-off" onClick={() => refreshState()}>
                      🔄 Reintentar
                    </button>
                  </>
                )}
                {pushMsg && <small className="notif-push-err">{pushMsg}</small>}
              </div>
            )}

            <div className="notif-list">
              {loading && items.length === 0 && (
                <div className="notif-state">
                  {[0, 1, 2, 3].map((i) => (
                    <div className="notif-skeleton" key={i} style={{ '--i': `${i * 80}ms` } as CSSProperties}></div>
                  ))}
                </div>
              )}
              {!loading && error && items.length === 0 && (
                <div className="notif-state notif-empty">
                  <span className="notif-empty-ico">📡</span>
                  <p>No se pudieron cargar los avisos.</p>
                  <button type="button" className="notif-retry-btn" onClick={() => load()}>Reintentar</button>
                </div>
              )}
              {!loading && !error && items.length === 0 && (
                <div className="notif-state notif-empty">
                  <span className="notif-empty-ico">🌟</span>
                  <p>¡Todo al día!<br /><em>Cuando publiquemos una noticia o una actividad, va a aparecer acá.</em></p>
                </div>
              )}

              {unreadItems.map((n, i) => (
                <button
                  type="button"
                  key={n.id}
                  className={`notif-item tone-${n.tone} ${n.urgent ? 'is-urgent' : ''}`}
                  onClick={() => openItem(n)}
                  title="Abrir y marcar como leído"
                  style={{ '--i': `${Math.min(i, 12) * 42}ms` } as CSSProperties}
                >
                  <span className="notif-ico" aria-hidden="true">{n.icon}</span>
                  <span className="notif-body">
                    <strong>{n.title}</strong>
                    <em>{n.body}</em>
                  </span>
                  <span className="notif-meta">
                    <span className="notif-new-dot" aria-hidden="true" />
                    {n.urgent && <span className="notif-urgent-tag">¡Ahora!</span>}
                    <time>{relLabel(n.time, now)}</time>
                  </span>
                </button>
              ))}

              {!loading && unreadItems.length === 0 && items.length > 0 && !showRead && (
                <div className="notif-state notif-empty">
                  <span className="notif-empty-ico">🌟</span>
                  <p>¡Todo al día!<br /><em>Ya leíste todos los avisos por ahora.</em></p>
                </div>
              )}

              {readItems.length > 0 && (
                <button
                  type="button"
                  className="notif-read-toggle"
                  onClick={() => setShowRead((s) => !s)}
                  aria-expanded={showRead}
                >
                  {showRead ? '▾' : '▸'} {showRead ? 'Ocultar' : 'Ver'} {readItems.length} {readItems.length === 1 ? 'aviso leído' : 'avisos leídos'}
                </button>
              )}

              {showRead && readItems.map((n, i) => (
                <button
                  type="button"
                  key={n.id}
                  className={`notif-item is-read tone-${n.tone}`}
                  onClick={() => openItem(n)}
                  style={{ '--i': `${Math.min(i, 12) * 30}ms` } as CSSProperties}
                >
                  <span className="notif-ico" aria-hidden="true">{n.icon}</span>
                  <span className="notif-body">
                    <strong>{n.title}</strong>
                    <em>{n.body}</em>
                  </span>
                  <span className="notif-meta">
                    <span className="notif-read-check" aria-hidden="true">✓</span>
                    <time>{relLabel(n.time, now)}</time>
                  </span>
                </button>
              ))}

              {items.length > 0 && !loading && <div className="notif-end">Fin de los avisos por ahora ☕</div>}
            </div>

            <footer className="notif-footer">
              <button type="button" onClick={() => go('noticias')}>📰 Novedades</button>
              <button type="button" onClick={() => go('agenda')}>📅 Agenda</button>
              <button type="button" onClick={() => go('documentos')}>📁 Documentos</button>
            </footer>
          </div>
        </>
      )}
    </>
  );
}