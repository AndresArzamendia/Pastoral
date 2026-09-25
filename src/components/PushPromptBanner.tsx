'use client';
import { useEffect, useState } from 'react';
import { useNotifications } from '../lib/useNotifications';

const ASK_KEY = 'pjl_push_prompt_ts';
const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

export default function PushPromptBanner() {
  const { supported, permission, subscribed, isSubscribing, backendReady, subscribe } = useNotifications();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Solo aparecer cuando el backend está listo y el usuario todavía no activó.
    if (!supported || !backendReady) return;
    if (subscribed || permission === 'denied') {
      setShow(false);
      return;
    }
    let shouldAsk = true;
    try {
      const ts = Number(localStorage.getItem(ASK_KEY) || 0);
      shouldAsk = !ts || Date.now() - ts > ASK_AGAIN_MS;
    } catch { shouldAsk = true; }
    setShow(shouldAsk);
  }, [supported, backendReady, subscribed, permission]);

  if (!show) return null;

  const activate = async () => {
    setBusy(true);
    setError(null);
    const ok = await subscribe();
    setBusy(false);
    if (ok) {
      setShow(false);
    } else {
      setError('No se pudo activar. Revisá los permisos del navegador.');
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(ASK_KEY, String(Date.now())); } catch {}
    setShow(false);
  };

  return (
    <>
      <div className="pp-banner" role="status" aria-label="Activar notificaciones de la Pastoral">
        <span className="pp-banner-ico" aria-hidden="true">🔔</span>
        <div className="pp-banner-body">
          <p className="pp-banner-title">Recibí los avisos de la Pastoral</p>
          <p className="pp-banner-text">Activá las notificaciones y enterate de misas, retiros y novedades al instante.</p>
          {error && <small className="pp-banner-err">{error}</small>}
        </div>
        <div className="pp-banner-actions">
          <button type="button" className="pp-banner-yes" onClick={activate} disabled={isSubscribing || busy}>
            {busy ? 'Activando…' : '🔔 Activar'}
          </button>
          <button type="button" className="pp-banner-no" onClick={dismiss}>Ahora no</button>
        </div>
      </div>
      <style>{`
        .pp-banner { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 95000; display: flex; align-items: center; gap: 14px; width: min(580px, calc(100vw - 24px)); padding: 14px 18px; border-radius: 18px; background: linear-gradient(150deg, rgba(12,20,38,.97), rgba(16,26,50,.97)); border: 1px solid rgba(200,151,58,.45); box-shadow: 0 20px 60px rgba(5,10,25,.5); color: #fff; animation: ppIn .5s cubic-bezier(.22,1.2,.36,1) both; }
        @keyframes ppIn { from { opacity: 0; transform: translate(-50%, 22px) scale(.94); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .pp-banner-ico { font-size: 26px; flex-shrink: 0; }
        .pp-banner-body { flex: 1; min-width: 0; }
        .pp-banner-title { margin: 0; font-weight: 800; font-size: 14px; color: #fff; }
        .pp-banner-text { margin: 3px 0 0; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.65); }
        .pp-banner-err { display: block; margin-top: 6px; font-size: 11.5px; font-weight: 700; color: #ffb3ab; }
        .pp-banner-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
        .pp-banner-yes { border: none; cursor: pointer; padding: 11px 18px; border-radius: 12px; font-family: var(--font-display); font-weight: 800; font-size: 13.5px; color: var(--navy); background: linear-gradient(120deg, #f0d9a6, var(--gold) 55%, #e8c36a); box-shadow: 0 10px 22px rgba(200,151,58,.35); transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; white-space: nowrap; }
        .pp-banner-yes:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 28px rgba(200,151,58,.45); }
        .pp-banner-yes:disabled { opacity: .6; cursor: wait; }
        .pp-banner-no { border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: rgba(255,255,255,.75); cursor: pointer; padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; transition: .25s; }
        .pp-banner-no:hover { background: rgba(255,255,255,.14); color: #fff; }
        @media (max-width: 600px) {
          .pp-banner { flex-wrap: wrap; text-align: center; }
          .pp-banner-actions { flex-direction: row; width: 100%; justify-content: center; }
        }
        @media (prefers-reduced-motion: reduce) { .pp-banner { animation: none; } }
      `}</style>
    </>
  );
}