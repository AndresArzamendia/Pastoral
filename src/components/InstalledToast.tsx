'use client';
import { useEffect, useState } from 'react';

/* Toast flotante "ya está instalada". Se muestra sin cambiar de pestaña y
   se oculta solo (3.5s). No vuelve a aparecer en la misma sesión. */
export default function InstalledToast() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('La app ya está instalada');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAlreadyInstalled = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.title) setTitle(detail.title);
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 3500);
    };
    window.addEventListener('pjl_already_installed', onAlreadyInstalled);
    return () => {
      window.removeEventListener('pjl_already_installed', onAlreadyInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: '96px',
        zIndex: 2147483002,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        padding: '0 16px',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1A2744 0%, var(--navy-mid) 100%)',
          color: '#fff',
          border: '1px solid rgba(200,151,58,0.45)',
          borderRadius: '999px',
          padding: '11px 20px',
          boxShadow: '0 12px 32px rgba(13,21,46,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontFamily: 'inherit',
          fontSize: '13.5px',
          fontWeight: 700,
          maxWidth: '92vw',
        }}
      >
        <span style={{ fontSize: '18px', lineHeight: 1 }} aria-hidden="true">✅</span>
        <span style={{ lineHeight: 1.35 }}>{title}</span>
      </div>
    </div>
  );
}