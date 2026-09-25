'use client';
import { useEffect, useRef, useState } from 'react';

export default function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingSw, setWaitingSw] = useState<ServiceWorker | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloaded = false;
    const doReload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    // El SW nuevo, una vez activado con el pedido de actualizar, le avisa a la
    // página (SW_ACTIVATED). Esto funciona igual en Android/iOS/tablet.
    function onMessage(event: MessageEvent) {
      if (requestedRef.current && event.data && event.data.type === 'SW_ACTIVATED') {
        doReload();
      }
    }

    function onControllerChange() {
      if (requestedRef.current) doReload();
      setUpdateAvailable(false);
      setWaitingSw(null);
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });

        const check = async () => {
          if (reg.waiting) {
            setUpdateAvailable(true);
            setWaitingSw(reg.waiting);
            return;
          }
          const freshReg = await navigator.serviceWorker.getRegistration('/');
          if (freshReg?.waiting) {
            setUpdateAvailable(true);
            setWaitingSw(freshReg.waiting);
          }
        };

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
              setWaitingSw(newWorker);
            }
          });
        });

        check();
      } catch {}
    };

    if (navigator.serviceWorker.controller) {
      register();
    } else {
      navigator.serviceWorker.ready.then(() => register());
    }

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!updateAvailable) return null;

  const applyUpdate = () => {
    if (!waitingSw) {
      window.location.reload();
      return;
    }
    requestedRef.current = true;
    waitingSw.postMessage({ type: 'SKIP_WAITING' });
    // Respaldo definitivo para móviles: si el SW nuevo tardara en activar,
    // recargamos igual después de un rato (la carga siguiente ya trae la
    // versión nueva aunque para el trayecto use la anterior).
    setTimeout(() => {
      if (requestedRef.current) window.location.reload();
    }, 4000);
  };

  return (
    <div className="pjl-update-banner" role="status" aria-live="polite">
      <div className="pjl-update-content">
        <span className="pjl-update-icon" aria-hidden="true">✨</span>
        <div className="pjl-update-text">
          <strong>¡Hay una nueva actualización!</strong>
          <span>Ya está disponible una versión mejorada. Actualizá para ver los cambios.</span>
        </div>
        <div className="pjl-update-actions">
          <button className="pjl-update-btn" onClick={applyUpdate}>Actualizar ahora</button>
          <button className="pjl-update-close" onClick={() => setUpdateAvailable(false)} aria-label="Cerrar">✕</button>
        </div>
      </div>
    </div>
  );
}
