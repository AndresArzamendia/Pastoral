'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNotifications } from '../lib/useNotifications';
import type { NotifItem } from '@/app/api/notifications/route';

const SEEN_KEY = 'pjl_notif_seen';
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

export default function NotificationBell() {
  const { supported, permission, subscribed, isSubscribing, backendReady, subscribe } = useNotifications();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const storeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success && Array.isArray(json.notifications)) {
        setItems(json.notifications);
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
    let raw: string | null = null;
    try { raw = localStorage.getItem(SEEN_KEY); } catch { /* sin acceso */ }
    setSeenAt(raw);

    load();

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
      clearInterval(interval);
      clearInterval(tick);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pjl_store_update', onStore);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', onKey);
      if (storeTimer.current) clearTimeout(storeTimer.current);
    };
  }, [load]);

  const unread = useMemo(
    () => items.filter((n) => !seenAt || new Date(n.time).getTime() > new Date(seenAt).getTime()).length,
    [items, seenAt]
  );

  const markAllRead = useCallback(() => {
    const latest = items.reduce((max, n) => {
      const t = new Date(n.time).getTime();
      return t && t > max ? t : max;
    }, 0);
    const val = latest ? new Date(latest).toISOString() : new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, val); } catch { /* sin acceso */ }
    setSeenAt(val);
  }, [items]);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next) markAllRead();
      return next;
    });
  }, [markAllRead]);

  const go = useCallback((href: string) => {
    setOpen(false);
    const page = new URLSearchParams(href.split('?')[1] || '').get('page') || 'home';
    window.dispatchEvent(new CustomEvent('pjl_navigate', { detail: { id: page } }));
  }, []);

  const handlePush = async () => {
    setPushMsg(null);
    const ok = await subscribe();
    if (!ok) setPushMsg('No se pudo activar. Revisá los permisos del navegador y la conexión.');
  };

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <>
      <button
        type="button"
        className={`notif-bell ${unread > 0 ? 'has-unread' : ''} ${open ? 'is-open' : ''}`}
        onClick={toggle}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
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
              {unread > 0 && <span className="notif-unread-chip">{unread} sin leer</span>}
              {unread > 0 && (
                <button type="button" className="notif-clear-btn" onClick={markAllRead} title="Marcar todo como leído">
                  ✓ Leído
                </button>
              )}
              <button type="button" className="notif-close-btn" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">
                ✕
              </button>
            </div>

            {supported && backendReady && (
              <div className="notif-push-row">
                {subscribed ? (
                  <span className="notif-push-ok">📣 Avisos push activados</span>
                ) : permission !== 'denied' ? (
                  <button type="button" className="notif-push-btn" onClick={handlePush} disabled={isSubscribing}>
                    {isSubscribing ? 'Activando…' : '🔕 Activar avisos push'}
                  </button>
                ) : null}
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
                  <p>¡Todo al día!<br /><em>Cuando publiquemos algo nuevo, va a aparecer acá.</em></p>
                </div>
              )}
              {items.map((n, i) => (
                <button
                  type="button"
                  key={n.id}
                  className={`notif-item tone-${n.tone} ${n.urgent ? 'is-urgent' : ''}`}
                  onClick={() => go(n.href)}
                  style={{ '--i': `${Math.min(i, 12) * 42}ms` } as CSSProperties}
                >
                  <span className="notif-ico" aria-hidden="true">{n.icon}</span>
                  <span className="notif-body">
                    <strong>{n.title}</strong>
                    <em>{n.body}</em>
                  </span>
                  <span className="notif-meta">
                    {n.urgent && <span className="notif-urgent-tag">¡Ahora!</span>}
                    <time>{relLabel(n.time, now)}</time>
                  </span>
                </button>
              ))}
              {items.length > 0 && !loading && <div className="notif-end">Fin de los avisos por ahora ☕</div>}
            </div>

            <footer className="notif-footer">
              <button type="button" onClick={() => go('/?page=noticias')}>📰 Novedades</button>
              <button type="button" onClick={() => go('/?page=agenda')}>📅 Agenda</button>
              <button type="button" onClick={() => go('/?page=documentos')}>📁 Documentos</button>
            </footer>
          </div>
        </>
      )}
    </>
  );
}