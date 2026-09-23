'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePwaInstall } from '../lib/usePwaInstall';

/* Estilo propio del banner, acorde a la identidad navy/dorado del sitio. */
const MODAL_STYLE: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483001,
  margin: '12px',
  padding: '16px 16px 14px',
  borderRadius: '18px',
  background: 'linear-gradient(135deg, #1A2744 0%, var(--navy-mid) 100%)',
  color: '#fff',
  boxShadow: '0 18px 50px rgba(13, 21, 46, 0.5)',
  fontFamily: 'inherit',
  maxWidth: '420px',
  marginLeft: 'auto',
  marginRight: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

export default function PwaInstallPrompt() {
  const { isStandalone, installed, isIos, isAndroid, inAppBrowser, canInstallNative, install, installState } = usePwaInstall();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  // En la página de guía (/instalar) NO se muestra ningún banner: solo ese
  // contenido con las instrucciones correspondientes. En escritorio tampoco
  // (ahí solo existen las instrucciones de esa misma página).
  const isGuidePage = pathname?.startsWith('/instalar') ?? false;
  const isDesktop = !isIos && !isAndroid;

  useEffect(() => {
    if (isStandalone || installed) return;
    if (dismissedThisSession) return;
    if (isGuidePage || isDesktop) return;

    const show = () => setVisible(true);
    const onInstalled = () => setVisible(false);

    // Se muestra en móviles de forma proactiva (Android o iOS). Aparece en
    // cada carga de página (sin guardado persistente) para que el aviso de
    // instalación nunca quede "atrapado" en un estado anterior de la sesión.
    // Si vienes de una recarga por intención de instalar, aparezca antes.
    let installIntent = false;
    try { installIntent = sessionStorage.getItem('pjl_install_intent') === '1'; } catch {}

    const autoShow = () => {
      if (isIos || isAndroid || canInstallNative) setVisible(true);
    };

    const timer = window.setTimeout(autoShow, installIntent ? 400 : 2500);
    window.addEventListener('pjl_request_install', show);
    window.addEventListener('pjl_app_installed', onInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pjl_request_install', show);
      window.removeEventListener('pjl_app_installed', onInstalled);
    };
  }, [isStandalone, installed, dismissedThisSession, isIos, isAndroid, canInstallNative, isGuidePage, isDesktop]);

  const handleInstall = useCallback(async () => {
    const ok = await install();
    if (ok) {
      setVisible(false);
      return;
    }
    // En Android la instalación es nativa y debe ocurrir aquí. Si el
    // navegador NO ofrece el prompt nativo mostramos un mensaje inline con
    // la vía manual (menú ⋮ → Instalar aplicación). Nunca se redirige a la
    // guía desde esta acción directa.
  }, [install]);

  const goToGuide = useCallback(() => {
    setVisible(false);
    window.location.href = '/instalar';
  }, []);

  const dismiss = useCallback(() => {
    // Solo se oculta para esta vista de la página: al volver a cargar (o en
    // una navegación nueva) el aviso vuelve a aparecer.
    setDismissedThisSession(true);
    setVisible(false);
  }, []);

  if (!visible || isStandalone || installed) return null;
  // En la guía o en escritorio el aviso nunca se renderiza: solo las
  // instrucciones de la página /instalar.
  if (isGuidePage || isDesktop) return null;

  const iosSteps = isIos
    ? [
        '1️⃣ Tocá Compartir (cuadrado con flecha ⬆️) en Safari.',
        '2️⃣ Elegí «Agregar a Pantalla de Inicio».',
        '3️⃣ Tocá «Agregar».',
      ]
    : null;

  const body = iosSteps ? (
    iosSteps.map((s, i) => (
      <div key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>{s}</div>
    ))
  ) : isAndroid ? (
    'Tocá «Instalar» y confirmá el aviso del navegador para dejar la app en tu teléfono.'
  ) : canInstallNative ? (
    'Tocá «Instalar» y confirmá el aviso del navegador.'
  ) : (
    'Tocá «Ver pasos» y te mostramos cómo instalar la app en este dispositivo.'
  );

  const androidManualHint =
    isAndroid && !canInstallNative && (installState === 'unavailable' || installState === 'dismissed') ? (
      inAppBrowser ? (
        <div style={{ marginTop: 4, fontSize: '12px', opacity: 0.9, lineHeight: 1.4 }}>
          Estás dentro de una app (Facebook, WhatsApp, Instagram…). Abrí esta web en{' '}
          <strong>Chrome</strong> y tocá «Instalar» de nuevo.
        </div>
      ) : (
        <div style={{ marginTop: 4, fontSize: '12px', opacity: 0.9, lineHeight: 1.4 }}>
          Si no aparece el aviso del navegador, abrí el menú <strong>⋮</strong> de Chrome y tocá{' '}
          <strong>«Instalar aplicación»</strong>.
        </div>
      )
    ) : null;

  return (
    <div role="dialog" aria-label="Instalar Pastoral Juvenil Luqueña" style={MODAL_STYLE}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '30px', lineHeight: 1 }} aria-hidden="true">📲</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '15px', lineHeight: 1.3 }}>
            Instalá la app de Pastoral Luque en tu teléfono
          </div>
          <div style={{ fontSize: '12.5px', opacity: 0.85, marginTop: 4, lineHeight: 1.45 }}>
            {body}
          </div>
          {androidManualHint}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={dismiss}
          style={{
            flex: 1, padding: '11px 14px', borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.35)', background: 'transparent',
            color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
          }}
        >
          Ahora no
        </button>
        {isAndroid ? (
          <button
            type="button"
            onClick={handleInstall}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: '999px', border: 'none',
              background: 'linear-gradient(135deg, #C8973A, #e2b45a)',
              color: '#1A2744', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            }}
          >
            {installState === 'installing' ? 'Preparando…' : '📲 Instalar'}
          </button>
        ) : (
          <button
            type="button"
            onClick={goToGuide}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: '999px', border: 'none',
              background: 'linear-gradient(135deg, #C8973A, #e2b45a)',
              color: '#1A2744', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            }}
          >
            Ver pasos →
          </button>
        )}
      </div>
    </div>
  );
}
